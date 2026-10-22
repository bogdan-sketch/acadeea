import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockMovementType, TransferStatus, UnitType } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { currentOrgWhere } from '@/prisma/tenant-context';
import { deriveMaterialStatus } from '@/modules/stock/material-status.util';
import { consumeRecipeLotsFifo } from '@/modules/stock/recipe-lot-fifo.util';
import { PaginatedDto } from '@/common/dto';
import { WebsocketService } from '@/modules/websocket';
import { pricePerStockUnit } from '@/modules/unit-conversions';
import {
  CreateLocationDto,
  UpdateLocationDto,
  LocationResponseDto,
  LocationStockResponseDto,
  LocationRecipeStockResponseDto,
  CreateTransferDto,
  TransferResponseDto,
  TransferItemResponseDto,
  TransferLocationDto,
  TransferApprovalDto,
  TransferUserDto,
  TransferQueryDto,
  UpdateTransferStatusDto,
  SignTransferAvizDto,
  AssignUserLocationDto,
  UpdateTransferApprovalDto,
  LocationUserResponseDto,
  LocationDashboardResponseDto,
  LocationDashboardMaterialDto,
} from './dto';

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ws: WebsocketService,
  ) {}

  // ========================================================================
  // Locations CRUD
  // ========================================================================

  async createLocation(dto: CreateLocationDto): Promise<LocationResponseDto> {
    const externalId = normalizeExternalId(dto.externalId);
    if (externalId) await this.ensureExternalIdFree(externalId);
    const location = await this.prisma.location.create({
      data: {
        name: dto.name,
        type: dto.type,
        address: dto.address,
        phone: dto.phone ?? null,
        externalId,
        isMainUnit: dto.isMainUnit ?? false,
        isActive: dto.isActive ?? true,
      },
    });

    this.logger.log(`Created location "${location.name}" (${location.type})`);
    return this.toLocationDto(location);
  }

  async findAllLocations(): Promise<LocationResponseDto[]> {
    const locations = await this.prisma.location.findMany({
      orderBy: { name: 'asc' },
    });
    return locations.map((l) => this.toLocationDto(l));
  }

  async findLocationById(id: string): Promise<LocationResponseDto> {
    const location = await this.prisma.location.findUnique({ where: { id } });
    if (!location) {
      throw new NotFoundException(`Location with ID "${id}" not found`);
    }
    return this.toLocationDto(location);
  }

  async updateLocation(id: string, dto: UpdateLocationDto): Promise<LocationResponseDto> {
    await this.findLocationById(id); // ensure exists
    const externalId =
      dto.externalId !== undefined ? normalizeExternalId(dto.externalId) : undefined;
    if (externalId) await this.ensureExternalIdFree(externalId, id);

    const location = await this.prisma.location.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(externalId !== undefined && { externalId }),
        ...(dto.isMainUnit !== undefined && { isMainUnit: dto.isMainUnit }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    return this.toLocationDto(location);
  }

  /** The shop's external id must point at exactly one location of the org. */
  private async ensureExternalIdFree(externalId: string, exceptId?: string): Promise<void> {
    const taken = await this.prisma.location.findFirst({
      where: { externalId, ...(exceptId && { id: { not: exceptId } }) },
      select: { name: true },
    });
    if (taken) {
      throw new ConflictException(
        `ID-ul extern „${externalId}” este deja folosit de locația „${taken.name}”`,
      );
    }
  }

  async deleteLocation(id: string, force = false): Promise<void> {
    const location = await this.prisma.location.findUnique({ where: { id } });

    if (!location) {
      throw new NotFoundException(`Location with ID "${id}" not found`);
    }

    if (!force) {
      // ANY transfer referencing this location blocks the plain delete —
      // completed/cancelled transfers (incl. auto foi de drum) hold RESTRICT
      // FKs too, not just active ones. Force deletes them all.
      const transferCount = await this.prisma.stockTransfer.count({
        where: { OR: [{ fromLocationId: id }, { toLocationId: id }] },
      });

      if (transferCount > 0) {
        throw new BadRequestException(
          'Cannot delete location with transfers referencing it. Use force to delete them too.',
        );
      }
    }

    // Delete related records in transaction
    await this.prisma.$transaction(async (tx) => {
      if (force) {
        // Return deducted stock to source for active transfers, then delete all
        // transfers referencing this location (items + approval cascade).
        const activeTransfers = await tx.stockTransfer.findMany({
          where: {
            OR: [{ fromLocationId: id }, { toLocationId: id }],
            status: { in: ['IN_ASTEPTARE', 'IN_TRANZIT'] },
          },
          include: { items: true },
        });

        for (const transfer of activeTransfers) {
          // Source already lost stock when the transfer was created. If the
          // source is not the location being deleted, give it back.
          if (transfer.fromLocationId === id) continue;
          for (const item of transfer.items) {
            // Recipe transfer items (finished goods) are handled per-location elsewhere.
            if (!item.rawMaterialId) continue;
            await tx.materialStock.upsert({
              where: {
                locationId_rawMaterialId: {
                  locationId: transfer.fromLocationId,
                  rawMaterialId: item.rawMaterialId,
                },
              },
              update: { quantity: { increment: item.quantity } },
              create: {
                locationId: transfer.fromLocationId,
                rawMaterialId: item.rawMaterialId,
                quantity: item.quantity,
              },
            });
          }
        }

        await tx.stockTransfer.deleteMany({
          where: { OR: [{ fromLocationId: id }, { toLocationId: id }] },
        });
      }

      await tx.userLocation.deleteMany({ where: { locationId: id } });
      await tx.materialStock.deleteMany({ where: { locationId: id } });
      // RecipeStock also holds a RESTRICT FK to Location.
      await tx.recipeStock.deleteMany({ where: { locationId: id } });
      // Same for the per-batch RecipeStockLot rows.
      await tx.recipeStockLot.deleteMany({ where: { locationId: id } });
      await tx.location.delete({ where: { id } });
    });

    this.logger.log(`Deleted location "${location.name}" (${id})${force ? ' [force]' : ''}`);
  }

  // ========================================================================
  // Location Stock
  // ========================================================================

  async findLocationStock(locationId: string): Promise<LocationStockResponseDto[]> {
    await this.findLocationById(locationId); // ensure exists

    const stocks = await this.prisma.materialStock.findMany({
      where: { locationId },
      include: { rawMaterial: { select: { title: true, unit: true, category: true } } },
      orderBy: { rawMaterial: { title: 'asc' } },
    });

    return stocks.map(
      (s) =>
        new LocationStockResponseDto({
          id: s.id,
          locationId: s.locationId,
          rawMaterialId: s.rawMaterialId,
          rawMaterialTitle: s.rawMaterial.title,
          category: s.rawMaterial.category,
          unit: s.rawMaterial.unit,
          quantity: Number(s.quantity),
          updatedAt: s.updatedAt,
        }),
    );
  }

  /// Per-location stock of produced recipes (produse finite + semipreparate).
  async findLocationRecipeStock(locationId: string): Promise<LocationRecipeStockResponseDto[]> {
    await this.findLocationById(locationId); // ensure exists

    const stocks = await this.prisma.recipeStock.findMany({
      where: { locationId },
      include: { recipe: { select: { name: true, type: true, category: true, unit: true } } },
      orderBy: { recipe: { name: 'asc' } },
    });

    return stocks.map(
      (s) =>
        new LocationRecipeStockResponseDto({
          id: s.id,
          locationId: s.locationId,
          recipeId: s.recipeId,
          recipeName: s.recipe.name,
          recipeType: s.recipe.type,
          category: s.recipe.category,
          unit: s.recipe.unit,
          quantity: Number(s.quantity),
          reservedCount: Number(s.reservedCount),
          expiryDate: s.expiryDate,
          updatedAt: s.updatedAt,
        }),
    );
  }

  // ========================================================================
  // Transfers
  // ========================================================================

  async createTransfer(dto: CreateTransferDto, userId: string): Promise<TransferResponseDto> {
    // Destination: a saved location XOR a free-text ad-hoc destination (event
    // transport) — goods leave the system when an ad-hoc transfer completes.
    const destinationName = dto.destinationName?.trim() || null;
    if (!dto.toLocationId && !destinationName) {
      throw new BadRequestException(
        'Alege o locație destinație sau scrie o destinație (eveniment).',
      );
    }
    if (dto.toLocationId && destinationName) {
      throw new BadRequestException('Trimite fie toLocationId, fie destinationName — nu ambele.');
    }

    if (dto.fromLocationId === dto.toLocationId) {
      throw new BadRequestException('Source and destination locations must be different');
    }

    if (!dto.items.length) {
      throw new BadRequestException('Transfer must have at least one item');
    }

    // Verify locations exist
    const [fromLoc, toLoc] = await Promise.all([
      this.prisma.location.findUnique({ where: { id: dto.fromLocationId } }),
      dto.toLocationId
        ? this.prisma.location.findUnique({ where: { id: dto.toLocationId } })
        : Promise.resolve(null),
    ]);

    if (!fromLoc) throw new NotFoundException(`Source location "${dto.fromLocationId}" not found`);
    if (dto.toLocationId && !toLoc) {
      throw new NotFoundException(`Destination location "${dto.toLocationId}" not found`);
    }

    if (dto.assignedToId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assignedToId } });
      if (!assignee) {
        throw new NotFoundException(`Assigned user "${dto.assignedToId}" not found`);
      }
    }

    // Each item is a raw material OR a recipe (finished good / semipreparat).
    // The unit is always the item's own stock unit — never trust a client unit.
    for (const item of dto.items) {
      if (!item.rawMaterialId && !item.recipeId) {
        throw new BadRequestException('Each item must reference a rawMaterialId or a recipeId');
      }
    }
    const materials = await this.prisma.rawMaterial.findMany({
      where: {
        id: { in: dto.items.flatMap((i) => (i.rawMaterialId ? [i.rawMaterialId] : [])) },
      },
      select: { id: true, unit: true, title: true },
    });
    const recipes = await this.prisma.recipe.findMany({
      where: { id: { in: dto.items.flatMap((i) => (i.recipeId ? [i.recipeId] : [])) } },
      select: { id: true, unit: true, name: true },
    });
    const matUnit = new Map(materials.map((m) => [m.id, m.unit]));
    const recUnit = new Map(recipes.map((r) => [r.id, r.unit]));
    const titleById = new Map<string, string>([
      ...materials.map((m) => [m.id, m.title] as [string, string]),
      ...recipes.map((r) => [r.id, r.name] as [string, string]),
    ]);

    // Create transfer in a transaction — deduct from source stock (per item type)
    const transfer = await this.prisma.$transaction(async (tx) => {
      const destLabelForNote = toLoc?.name ?? destinationName ?? '';
      for (const item of dto.items) {
        if (item.rawMaterialId) {
          // Row-locked like the task reservation path, so a task can't reserve
          // (or another transfer take) the same stock concurrently.
          const [stock] = await tx.$queryRaw<
            { quantity: Prisma.Decimal; reservedCount: Prisma.Decimal }[]
          >`
            SELECT "quantity", "reservedCount" FROM "MaterialStock"
            WHERE "locationId" = ${dto.fromLocationId}::uuid
              AND "rawMaterialId" = ${item.rawMaterialId}::uuid
            FOR UPDATE
          `;
          this.assertTransferable(
            titleById.get(item.rawMaterialId) ?? item.rawMaterialId,
            stock,
            item.quantity,
            matUnit.get(item.rawMaterialId),
          );
          await tx.materialStock.update({
            where: {
              locationId_rawMaterialId: {
                locationId: dto.fromLocationId,
                rawMaterialId: item.rawMaterialId,
              },
            },
            data: { quantity: { decrement: new Prisma.Decimal(item.quantity) } },
          });
        } else {
          const recipeId = item.recipeId;
          if (!recipeId) {
            throw new BadRequestException('Each item must reference a rawMaterialId or a recipeId');
          }
          const [stock] = await tx.$queryRaw<
            { quantity: Prisma.Decimal; reservedCount: Prisma.Decimal }[]
          >`
            SELECT "quantity", "reservedCount" FROM "RecipeStock"
            WHERE "locationId" = ${dto.fromLocationId}::uuid AND "recipeId" = ${recipeId}::uuid
            FOR UPDATE
          `;
          this.assertTransferable(
            titleById.get(recipeId) ?? recipeId,
            stock,
            item.quantity,
            recUnit.get(recipeId),
          );
          await tx.recipeStock.update({
            where: {
              locationId_recipeId: { locationId: dto.fromLocationId, recipeId },
            },
            data: { quantity: { decrement: new Prisma.Decimal(item.quantity) } },
          });
          // Mirror the aggregate decrement on the source's batch lots (FIFO).
          await consumeRecipeLotsFifo(tx, recipeId, dto.fromLocationId, item.quantity);
        }
        // Movement trail at the SOURCE: the goods left it now.
        await this.recordTransferMovement(tx, {
          rawMaterialId: item.rawMaterialId ?? null,
          recipeId: item.rawMaterialId ? null : (item.recipeId ?? null),
          locationId: dto.fromLocationId,
          unit: (item.rawMaterialId
            ? matUnit.get(item.rawMaterialId)
            : recUnit.get(item.recipeId as string)) as UnitType,
          userId,
          note: `Transfer către ${destLabelForNote}: −${item.quantity}`,
        });
      }

      // Create transfer record
      return tx.stockTransfer.create({
        data: {
          fromLocationId: dto.fromLocationId,
          toLocationId: dto.toLocationId ?? null,
          destinationName,
          destinationAddress: destinationName ? dto.destinationAddress?.trim() || null : null,
          destinationContact: dto.destinationContact?.trim() || null,
          notes: dto.notes ?? null,
          createdById: userId,
          assignedToId: dto.assignedToId ?? null,
          delegateIdCard: dto.delegateIdCard?.trim() || null,
          transportMeans: dto.transportMeans?.trim() || null,
          dispatchedAt: dto.dispatchedAt ? new Date(dto.dispatchedAt) : null,
          items: {
            create: dto.items.map((item) => {
              const unit = item.rawMaterialId
                ? matUnit.get(item.rawMaterialId)
                : item.recipeId
                  ? recUnit.get(item.recipeId)
                  : undefined;
              if (!unit) {
                throw new NotFoundException(
                  `Item "${item.rawMaterialId ?? item.recipeId}" not found`,
                );
              }
              return {
                rawMaterialId: item.rawMaterialId ?? null,
                recipeId: item.recipeId ?? null,
                quantity: item.quantity,
                unit,
              };
            }),
          },
        },
        include: {
          fromLocation: true,
          toLocation: true,
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          items: {
            include: {
              rawMaterial: { select: { title: true } },
              recipe: { select: { name: true } },
            },
          },
          approval: true,
        },
      });
    });

    const destLabel = toLoc?.name ?? (destinationName as string);
    this.logger.log(
      `Created transfer from "${fromLoc.name}" to "${destLabel}" with ${dto.items.length} items`,
    );

    this.ws.emitActivity({
      type: 'STOCK_MOVEMENT',
      title: `Transfer: ${fromLoc.name} → ${destLabel}`,
      description: `${dto.items.length} produse transferate`,
      metadata: {},
    });

    return this.toTransferDto(transfer);
  }

  async findTransfers(query: TransferQueryDto): Promise<PaginatedDto<TransferResponseDto>> {
    const { page = 1, limit = 20, status, fromLocationId, toLocationId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.StockTransferWhereInput = {};
    if (status) where.status = status;
    if (fromLocationId) where.fromLocationId = fromLocationId;
    if (toLocationId) where.toLocationId = toLocationId;

    const [transfers, total] = await Promise.all([
      this.prisma.stockTransfer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        // Never pull the signature PNG into a list response — toTransferDto only
        // needs the derived hasReceiverSignature boolean.
        omit: { receiverSignature: true },
        include: {
          fromLocation: true,
          toLocation: true,
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          items: {
            include: {
              rawMaterial: { select: { title: true } },
              recipe: { select: { name: true } },
            },
          },
          approval: true,
        },
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);

    const data = transfers.map((t) => this.toTransferDto(t));
    return new PaginatedDto(data, total, page, limit);
  }

  async findTransferById(id: string): Promise<TransferResponseDto> {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: {
        fromLocation: true,
        toLocation: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        items: {
          include: {
            rawMaterial: { select: { title: true } },
            recipe: { select: { name: true } },
          },
        },
        approval: true,
      },
    });

    if (!transfer) {
      throw new NotFoundException(`Transfer with ID "${id}" not found`);
    }

    return this.toTransferDto(transfer);
  }

  async updateTransferStatus(
    id: string,
    dto: UpdateTransferStatusDto,
    userId: string,
  ): Promise<TransferResponseDto> {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: {
        items: {
          include: { rawMaterial: { select: { title: true } }, recipe: { select: { name: true } } },
        },
        fromLocation: true,
        toLocation: true,
      },
    });

    if (!transfer) {
      throw new NotFoundException(`Transfer with ID "${id}" not found`);
    }

    // Validate transitions
    const validTransitions: Record<string, string[]> = {
      IN_ASTEPTARE: ['IN_TRANZIT', 'ANULAT'],
      IN_TRANZIT: ['FINALIZAT', 'ANULAT'],
    };

    const allowed = validTransitions[transfer.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(`Cannot transition from ${transfer.status} to ${dto.status}`);
    }

    // Validate the transport person; applied via the guarded status claim below.
    const assigneePatch: { assignedToId?: string } = {};
    if (dto.assignedToId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assignedToId } });
      if (!assignee) {
        throw new NotFoundException(`Assigned user "${dto.assignedToId}" not found`);
      }
      assigneePatch.assignedToId = dto.assignedToId;
    }

    // A transfer can't teleport — moving it into transit requires a transporter.
    if (dto.status === TransferStatus.IN_TRANZIT && !dto.assignedToId && !transfer.assignedToId) {
      throw new BadRequestException(
        'Transferul trebuie sa aiba o persoana asignata pentru transport inainte de a fi pus in tranzit.',
      );
    }

    // FINALIZAT: add to destination MaterialStock (saved location), or — for
    // ad-hoc destinations (event transports) — the goods simply leave the
    // system: source was already deducted at creation, so only the global
    // aggregates need a resync.
    if (dto.status === TransferStatus.FINALIZAT) {
      const toLocationId = transfer.toLocationId;

      await this.prisma.$transaction(async (tx) => {
        // Atomically claim the transition first. A concurrent or client-retried
        // FINALIZAT then matches zero rows and aborts, so the destination is
        // never credited twice (the source was debited once, at creation).
        const claimed = await tx.stockTransfer.updateMany({
          where: { id, status: TransferStatus.IN_TRANZIT },
          data: { status: TransferStatus.FINALIZAT, completedAt: new Date(), ...assigneePatch },
        });
        if (claimed.count === 0) {
          throw new BadRequestException('Transferul a fost deja finalizat.');
        }
        for (const item of transfer.items) {
          if (!toLocationId) {
            // Ad-hoc: no destination stock. Recompute the item's global
            // counter as the sum of its per-location rows.
            if (item.rawMaterialId) {
              const agg = await tx.materialStock.aggregate({
                where: { rawMaterialId: item.rawMaterialId },
                _sum: { quantity: true },
              });
              const newCount = Number(agg._sum.quantity ?? 0);
              // Rescrie si statusul — altfel coloana ramane stale si orice
              // consumator care inca o citeste se contrazice cu /stock/stats.
              const mat = await tx.rawMaterial.findUnique({
                where: { id: item.rawMaterialId },
                select: { minimumStock: true, status: true },
              });
              await tx.rawMaterial.update({
                where: { id: item.rawMaterialId },
                data: {
                  stockCount: newCount,
                  ...(mat
                    ? {
                        status: deriveMaterialStatus(
                          newCount,
                          Number(mat.minimumStock),
                          mat.status,
                        ),
                      }
                    : {}),
                },
              });
            } else if (item.recipeId) {
              const agg = await tx.recipeStock.aggregate({
                where: { recipeId: item.recipeId },
                _sum: { quantity: true },
              });
              await tx.recipe.update({
                where: { id: item.recipeId },
                data: { stockCount: Math.max(0, Math.round(Number(agg._sum.quantity ?? 0))) },
              });
            }
            continue;
          }
          if (item.rawMaterialId) {
            await tx.materialStock.upsert({
              where: {
                locationId_rawMaterialId: {
                  locationId: toLocationId,
                  rawMaterialId: item.rawMaterialId,
                },
              },
              update: { quantity: { increment: item.quantity } },
              create: {
                locationId: toLocationId,
                rawMaterialId: item.rawMaterialId,
                quantity: item.quantity,
              },
            });
            await this.recordTransferMovement(tx, {
              rawMaterialId: item.rawMaterialId,
              recipeId: null,
              locationId: toLocationId,
              unit: item.unit,
              userId,
              note: `Transfer de la ${transfer.fromLocation.name}: +${Number(item.quantity)}`,
            });
          } else if (item.recipeId) {
            await tx.recipeStock.upsert({
              where: {
                locationId_recipeId: {
                  locationId: toLocationId,
                  recipeId: item.recipeId,
                },
              },
              update: { quantity: { increment: item.quantity } },
              create: {
                locationId: toLocationId,
                recipeId: item.recipeId,
                quantity: item.quantity,
              },
            });

            // Carry the batch expiry with the goods: conservative-min into the
            // destination (ignoring a stale expiry on a previously-empty row),
            // otherwise shop stock never shows up in /stock/expiring.
            const src = await tx.recipeStock.findUnique({
              where: {
                locationId_recipeId: {
                  locationId: transfer.fromLocationId,
                  recipeId: item.recipeId,
                },
              },
              select: { expiryDate: true },
            });
            const srcExpiry = src?.expiryDate ?? null;
            if (srcExpiry) {
              const dest = await tx.recipeStock.findUnique({
                where: {
                  locationId_recipeId: {
                    locationId: toLocationId,
                    recipeId: item.recipeId,
                  },
                },
                select: { quantity: true, expiryDate: true },
              });
              const prevQty = Number(dest?.quantity ?? 0) - Number(item.quantity);
              const current = prevQty > 0 ? (dest?.expiryDate ?? null) : null;
              await tx.recipeStock.update({
                where: {
                  locationId_recipeId: {
                    locationId: toLocationId,
                    recipeId: item.recipeId,
                  },
                },
                data: { expiryDate: current && current < srcExpiry ? current : srcExpiry },
              });
            }
            await this.recordTransferMovement(tx, {
              rawMaterialId: null,
              recipeId: item.recipeId,
              locationId: toLocationId,
              unit: item.unit,
              userId,
              note: `Transfer de la ${transfer.fromLocation.name}: +${Number(item.quantity)}`,
            });
          }
        }
      });

      this.logger.log(
        `Transfer ${id} completed — ${
          transfer.toLocation
            ? `stock added to "${transfer.toLocation.name}"`
            : `goods delivered to ad-hoc destination "${transfer.destinationName}"`
        }`,
      );
    }
    // ANULAT: return stock to source
    else if (dto.status === TransferStatus.ANULAT) {
      // Only return stock if it was deducted (status was IN_ASTEPTARE or IN_TRANZIT)
      await this.prisma.$transaction(async (tx) => {
        // Claim the cancel atomically so a retried/concurrent ANULAT can't
        // return the source stock twice.
        const claimed = await tx.stockTransfer.updateMany({
          where: {
            id,
            status: { in: [TransferStatus.IN_ASTEPTARE, TransferStatus.IN_TRANZIT] },
          },
          data: { status: TransferStatus.ANULAT, ...assigneePatch },
        });
        if (claimed.count === 0) {
          throw new BadRequestException('Transferul a fost deja procesat.');
        }
        for (const item of transfer.items) {
          if (item.rawMaterialId) {
            await tx.materialStock.upsert({
              where: {
                locationId_rawMaterialId: {
                  locationId: transfer.fromLocationId,
                  rawMaterialId: item.rawMaterialId,
                },
              },
              update: { quantity: { increment: item.quantity } },
              create: {
                locationId: transfer.fromLocationId,
                rawMaterialId: item.rawMaterialId,
                quantity: item.quantity,
              },
            });
          } else if (item.recipeId) {
            await tx.recipeStock.upsert({
              where: {
                locationId_recipeId: {
                  locationId: transfer.fromLocationId,
                  recipeId: item.recipeId,
                },
              },
              update: { quantity: { increment: item.quantity } },
              create: {
                locationId: transfer.fromLocationId,
                recipeId: item.recipeId,
                quantity: item.quantity,
              },
            });
          }
          await this.recordTransferMovement(tx, {
            rawMaterialId: item.rawMaterialId,
            recipeId: item.rawMaterialId ? null : item.recipeId,
            locationId: transfer.fromLocationId,
            unit: item.unit,
            userId,
            note: `Transfer anulat — returnat: +${Number(item.quantity)}`,
          });
        }
      });

      this.logger.log(
        `Transfer ${id} cancelled — stock returned to "${transfer.fromLocation.name}"`,
      );
    }
    // IN_TRANZIT: just update status (guarded so a stale request can't reopen it)
    else {
      const claimed = await this.prisma.stockTransfer.updateMany({
        where: { id, status: TransferStatus.IN_ASTEPTARE },
        data: { status: TransferStatus.IN_TRANZIT, ...assigneePatch },
      });
      if (claimed.count === 0) {
        throw new BadRequestException('Transferul a fost deja procesat.');
      }
      this.logger.log(`Transfer ${id} marked as in transit`);
    }

    return this.findTransferById(id);
  }

  /**
   * A transfer may only take FREE stock: quantity minus what running tasks
   * reserved (StockReservation → reservedCount). Shipping reserved stock would
   * leave the task's reservation pointing at goods that are gone.
   */
  private assertTransferable(
    title: string,
    stock: { quantity: Prisma.Decimal; reservedCount: Prisma.Decimal } | undefined,
    requested: number,
    unit?: string,
  ): void {
    const quantity = Number(stock?.quantity ?? 0);
    const reserved = Number(stock?.reservedCount ?? 0);
    const available = Math.max(0, quantity - reserved);
    if (available < requested) {
      const u = unit ? ` ${unit}` : '';
      throw new BadRequestException(
        `Stoc insuficient la sursă pentru „${title}”: disponibil ${available}${u}` +
          (reserved > 0 ? ` (${reserved}${u} rezervat pentru taskuri în lucru)` : '') +
          `, cerut ${requested}${u}.`,
      );
    }
  }

  /**
   * Movement trail for a transfer leg at one location. Recorded as AJUSTARE
   * carrying the location's resulting ABSOLUTE quantity — the same contract
   * every client already renders for AJUSTARE (no sign, "stock is now X") —
   * with the transfer delta in the note. A dedicated transfer movement type
   * would need a schema enum value that shipped iOS builds can't decode yet.
   */
  private async recordTransferMovement(
    // Interactive-transaction client of the tenant-extended Prisma (same
    // loose typing as consumeRecipeLotsFifo).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    leg: {
      rawMaterialId: string | null;
      recipeId: string | null;
      locationId: string;
      unit: UnitType;
      userId: string;
      note: string;
    },
  ): Promise<void> {
    const row = leg.rawMaterialId
      ? await tx.materialStock.findUnique({
          where: {
            locationId_rawMaterialId: {
              locationId: leg.locationId,
              rawMaterialId: leg.rawMaterialId,
            },
          },
          select: { quantity: true },
        })
      : leg.recipeId
        ? await tx.recipeStock.findUnique({
            where: { locationId_recipeId: { locationId: leg.locationId, recipeId: leg.recipeId } },
            select: { quantity: true },
          })
        : null;
    if (!leg.rawMaterialId && !leg.recipeId) return;
    await tx.stockMovement.create({
      data: {
        rawMaterialId: leg.rawMaterialId,
        recipeId: leg.recipeId,
        locationId: leg.locationId,
        movementType: StockMovementType.AJUSTARE,
        quantity: row?.quantity ?? 0,
        unit: leg.unit,
        performedById: leg.userId,
        referenceNote: leg.note,
      },
    });
  }

  // ========================================================================
  // User–Location Assignments
  // ========================================================================

  async assignUserToLocation(
    locationId: string,
    dto: AssignUserLocationDto,
  ): Promise<LocationUserResponseDto> {
    await this.findLocationById(locationId);

    // If isPrimary, unset other primary for this user
    if (dto.isPrimary) {
      await this.prisma.userLocation.updateMany({
        where: { userId: dto.userId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const ul = await this.prisma.userLocation.upsert({
      where: {
        userId_locationId: { userId: dto.userId, locationId },
      },
      update: { isPrimary: dto.isPrimary ?? false },
      create: {
        userId: dto.userId,
        locationId,
        isPrimary: dto.isPrimary ?? false,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
    });

    this.logger.log(`Assigned user ${dto.userId} to location ${locationId}`);
    return new LocationUserResponseDto({
      id: ul.id,
      userId: ul.user.id,
      firstName: ul.user.firstName,
      lastName: ul.user.lastName,
      role: ul.user.role,
      isPrimary: ul.isPrimary,
      createdAt: ul.createdAt,
    });
  }

  async removeUserFromLocation(locationId: string, userId: string): Promise<void> {
    await this.prisma.userLocation.delete({
      where: { userId_locationId: { userId, locationId } },
    });
    this.logger.log(`Removed user ${userId} from location ${locationId}`);
  }

  async findLocationUsers(locationId: string): Promise<LocationUserResponseDto[]> {
    await this.findLocationById(locationId);

    const assignments = await this.prisma.userLocation.findMany({
      where: { locationId },
      include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    return assignments.map(
      (ul) =>
        new LocationUserResponseDto({
          id: ul.id,
          userId: ul.user.id,
          firstName: ul.user.firstName,
          lastName: ul.user.lastName,
          role: ul.user.role,
          isPrimary: ul.isPrimary,
          createdAt: ul.createdAt,
        }),
    );
  }

  async findMyLocations(userId: string): Promise<LocationResponseDto[]> {
    const assignments = await this.prisma.userLocation.findMany({
      where: { userId },
      include: { location: true },
      orderBy: [{ isPrimary: 'desc' }, { location: { name: 'asc' } }],
    });

    return assignments.map((ul) => this.toLocationDto(ul.location));
  }

  // ========================================================================
  // Aviz de însoțire a mărfii
  // ========================================================================

  /**
   * Printable "aviz de însoțire a mărfii" payload for a transfer.
   * The serial (AVZ-YYYYMMDD-NNN) is assigned lazily on the first request and
   * persisted, so reprints keep the same serie/număr. Supplier = the
   * organization at the source location, buyer = the organization at the
   * destination (same legal entity for internal transfers — CUI shared).
   * Prices: recipe items use the selling price, raw materials the purchase
   * price (după caz — null when unknown).
   */
  async getTransferAviz(id: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: {
        fromLocation: true,
        toLocation: true,
        assignedTo: { select: { firstName: true, lastName: true } },
        items: {
          include: {
            rawMaterial: { select: { title: true, purchasePrice: true, unit: true } },
            recipe: { select: { name: true, sellingPrice: true } },
          },
        },
      },
    });
    if (!transfer) {
      throw new NotFoundException(`Transfer with ID "${id}" not found`);
    }

    let serial = transfer.avizSerial;
    if (!serial) {
      // Retry on the unique constraint: two first-prints racing both compute
      // the same next number; the loser recomputes.
      for (let attempt = 0; attempt < 3 && !serial; attempt++) {
        const candidate = await this.generateSerial('AVZ', 'avizSerial');
        try {
          // Guarded write: only claim the serial if still unassigned — an
          // unconditional update would let a concurrent first-print overwrite
          // an already-printed serial. count 0 → someone else won; use theirs.
          const res = await this.prisma.stockTransfer.updateMany({
            where: { id, avizSerial: null },
            data: { avizSerial: candidate },
          });
          if (res.count === 1) {
            serial = candidate;
          } else {
            const fresh = await this.prisma.stockTransfer.findUnique({
              where: { id },
              select: { avizSerial: true },
            });
            serial = fresh?.avizSerial ?? null;
          }
        } catch (err) {
          if ((err as { code?: string }).code !== 'P2002') throw err;
        }
      }
      if (!serial) {
        throw new BadRequestException('Nu s-a putut aloca un numar de aviz — incearca din nou');
      }
    }

    const org = await this.prisma.organization.findFirst({
      where: currentOrgWhere(),
      orderBy: { createdAt: 'asc' },
    });

    return {
      serial,
      issuedAt: new Date().toISOString(),
      transferId: transfer.id,
      transferCreatedAt: transfer.createdAt,
      supplier: {
        name: org?.name ?? 'Acadeea',
        address: transfer.fromLocation.address || org?.legalAddress || null,
        cui: org?.cui ?? null,
        locationName: transfer.fromLocation.name,
      },
      buyer: {
        name: org?.name ?? 'Acadeea',
        address:
          transfer.toLocation?.address || transfer.destinationAddress || org?.legalAddress || null,
        cui: org?.cui ?? null,
        locationName: transfer.toLocation?.name ?? transfer.destinationName ?? '',
      },
      delegateName: transfer.assignedTo
        ? `${transfer.assignedTo.firstName} ${transfer.assignedTo.lastName}`
        : null,
      // Delegate / transport details captured on the transfer (previously blank
      // hand-filled lines on the printed aviz).
      delegateIdCard: transfer.delegateIdCard ?? null,
      transportMeans: transfer.transportMeans ?? null,
      dispatchedAt: transfer.dispatchedAt ? transfer.dispatchedAt.toISOString() : null,
      // Digital receipt signature (semnatura primire).
      receiverName: transfer.receiverName ?? null,
      receivedAt: transfer.receivedAt ? transfer.receivedAt.toISOString() : null,
      hasReceiverSignature: transfer.receiverSignature != null,
      // Recipient (person) at the destination — shown as "Destinatar".
      recipientName: transfer.destinationContact ?? null,
      items: transfer.items.map((item) => ({
        name: item.rawMaterial?.title ?? item.recipe?.name ?? '',
        quantity: Number(item.quantity),
        unit: item.unit,
        // Material prices are entered per commercial unit (RON/kg, RON/l);
        // item quantities are in the stock unit — normalize so qty × price adds up.
        unitPrice:
          item.recipe?.sellingPrice != null
            ? Number(item.recipe.sellingPrice)
            : item.rawMaterial?.purchasePrice != null
              ? pricePerStockUnit(Number(item.rawMaterial.purchasePrice), item.rawMaterial.unit)
              : null,
      })),
    };
  }

  /**
   * Printable "declaratie de conformitate" payload for a transfer — issued
   * alongside every aviz/foaie de parcurs. Serial (CB-YYYYMMDD-NNN) assigned
   * lazily and persisted so reprints keep the same number. The org identity
   * block (name, address, CUI, reg. com., contact, administrator) comes from
   * the Organization settings.
   */
  async getTransferConformity(id: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: {
        toLocation: true,
        items: {
          include: {
            rawMaterial: { select: { title: true } },
            recipe: { select: { name: true } },
          },
        },
      },
    });
    if (!transfer) {
      throw new NotFoundException(`Transfer with ID "${id}" not found`);
    }

    let serial = transfer.conformitySerial;
    if (!serial) {
      for (let attempt = 0; attempt < 3 && !serial; attempt++) {
        const candidate = await this.generateSerial('CB', 'conformitySerial');
        try {
          const res = await this.prisma.stockTransfer.updateMany({
            where: { id, conformitySerial: null },
            data: { conformitySerial: candidate },
          });
          if (res.count === 1) {
            serial = candidate;
          } else {
            const fresh = await this.prisma.stockTransfer.findUnique({
              where: { id },
              select: { conformitySerial: true },
            });
            serial = fresh?.conformitySerial ?? null;
          }
        } catch (err) {
          if ((err as { code?: string }).code !== 'P2002') throw err;
        }
      }
      if (!serial) {
        throw new BadRequestException(
          'Nu s-a putut aloca un numar de declaratie — incearca din nou',
        );
      }
    }

    const org = await this.prisma.organization.findFirst({
      where: currentOrgWhere(),
      orderBy: { createdAt: 'asc' },
    });

    return {
      serial,
      issuedAt: new Date().toISOString(),
      transferId: transfer.id,
      deliveredTo: (() => {
        const name = transfer.toLocation?.name ?? transfer.destinationName ?? '';
        const address = transfer.toLocation?.address ?? transfer.destinationAddress ?? null;
        return `${name}${address ? ', ' + address : ''}`;
      })(),
      deliveryDate: transfer.createdAt,
      organization: {
        name: org?.name || 'Acadeea',
        legalAddress: org?.legalAddress || null,
        cui: org?.cui || null,
        regCom: org?.regCom || null,
        contactPhone: org?.contactPhone || null,
        contactEmail: org?.contactEmail || null,
        website: org?.website || null,
        administratorName: org?.administratorName || null,
      },
      items: transfer.items.map((item) => ({
        name: item.rawMaterial?.title ?? item.recipe?.name ?? '',
        quantity: Number(item.quantity),
        unit: item.unit,
      })),
    };
  }

  /**
   * Capture the delivery signature on a transfer's aviz (semnatura de primire).
   * Mirrors the order DeliveryNote signature flow.
   */
  async signTransferAviz(
    id: string,
    dto: SignTransferAvizDto,
    signature: Uint8Array | undefined,
  ): Promise<TransferResponseDto> {
    if (!signature || signature.length === 0) {
      throw new BadRequestException('Imaginea semnaturii este obligatorie.');
    }
    const transfer = await this.prisma.stockTransfer.findUnique({ where: { id } });
    if (!transfer) {
      throw new NotFoundException(`Transfer with ID "${id}" not found`);
    }
    // "Data primirii în gestiune" only makes sense once the goods were actually
    // delivered — a receipt signature on a pending/in-transit/cancelled transfer
    // would be a false entry on a legal document.
    if (transfer.status !== TransferStatus.FINALIZAT) {
      throw new BadRequestException(
        'Semnătura de primire se poate adăuga doar după finalizarea transferului.',
      );
    }
    await this.prisma.stockTransfer.update({
      where: { id },
      data: {
        receiverName: dto.receiverName.trim(),
        receiverSignature: Buffer.from(signature),
        receivedAt: new Date(),
      },
    });
    return this.findTransferById(id);
  }

  /** Return the aviz receipt signature as raw PNG bytes. */
  async getTransferSignatureImage(id: string): Promise<Buffer> {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      select: { receiverSignature: true },
    });
    if (!transfer?.receiverSignature) {
      throw new NotFoundException('Nicio semnatura inregistrata pentru acest transfer.');
    }
    return Buffer.from(transfer.receiverSignature);
  }

  /** Sequential aviz serial: AVZ-YYYYMMDD-NNN (per day). */
  private async generateSerial(
    kind: 'AVZ' | 'CB',
    field: 'avizSerial' | 'conformitySerial',
  ): Promise<string> {
    const today = new Date();
    const dateStr =
      today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, '0') +
      today.getDate().toString().padStart(2, '0');
    const prefix = `${kind}-${dateStr}-`;

    // Numeric max, not lexicographic order-by: '...-999' sorts above
    // '...-1000' as a string, which would loop the same number forever.
    const todays = await this.prisma.stockTransfer.findMany({
      where: { [field]: { startsWith: prefix } },
      select: { avizSerial: true, conformitySerial: true },
    });
    const maxSeq = todays.reduce((max, t) => {
      const n = parseInt((t[field] ?? '').slice(prefix.length), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    return `${prefix}${(maxSeq + 1).toString().padStart(3, '0')}`;
  }

  // ========================================================================
  // Transfer Approval
  // ========================================================================

  async updateTransferApproval(
    transferId: string,
    dto: UpdateTransferApprovalDto,
    userId: string,
  ): Promise<TransferResponseDto> {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id: transferId },
      include: { approval: true },
    });

    if (!transfer) {
      throw new NotFoundException(`Transfer with ID "${transferId}" not found`);
    }

    await this.prisma.transferApproval.upsert({
      where: { transferId },
      update: {
        status: dto.status,
        approvedById: userId,
        reason: dto.reason ?? null,
      },
      create: {
        transferId,
        status: dto.status,
        approvedById: userId,
        reason: dto.reason ?? null,
      },
    });

    this.logger.log(`Transfer ${transferId} approval set to ${dto.status} by user ${userId}`);

    this.ws.emitActivity({
      type: 'STOCK_MOVEMENT',
      title: `Transfer ${dto.status === 'APPROVED' ? 'aprobat' : 'respins'}`,
      description: `Transferul #${transferId.slice(0, 8)} a fost ${dto.status === 'APPROVED' ? 'aprobat' : 'respins'}`,
      metadata: {},
    });

    return this.findTransferById(transferId);
  }

  // ========================================================================
  // Location Dashboard
  // ========================================================================

  async getLocationDashboard(locationId: string): Promise<LocationDashboardResponseDto> {
    const location = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!location) {
      throw new NotFoundException(`Location with ID "${locationId}" not found`);
    }

    const stocks = await this.prisma.materialStock.findMany({
      where: { locationId },
      include: { rawMaterial: { select: { title: true, unit: true } } },
      orderBy: { rawMaterial: { title: 'asc' } },
    });

    const [assignedUsers, pendingInbound, pendingOutbound] = await Promise.all([
      this.prisma.userLocation.count({ where: { locationId } }),
      this.prisma.stockTransfer.count({
        where: { toLocationId: locationId, status: 'IN_ASTEPTARE' },
      }),
      this.prisma.stockTransfer.count({
        where: { fromLocationId: locationId, status: 'IN_ASTEPTARE' },
      }),
    ]);

    // Low stock = quantity ≤ 0 (no minStock field yet)
    const lowStock = stocks
      .filter((s) => Number(s.quantity) <= 0)
      .map(
        (s) =>
          new LocationDashboardMaterialDto({
            rawMaterialId: s.rawMaterialId,
            title: s.rawMaterial.title,
            quantity: Number(s.quantity),
            unit: s.rawMaterial.unit,
          }),
      );

    return new LocationDashboardResponseDto({
      locationId: location.id,
      locationName: location.name,
      totalMaterials: stocks.length,
      assignedUsers,
      pendingInboundTransfers: pendingInbound,
      pendingOutboundTransfers: pendingOutbound,
      lowStockMaterials: lowStock,
    });
  }

  // ========================================================================
  // Mappers
  // ========================================================================

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toLocationDto(location: any): LocationResponseDto {
    return new LocationResponseDto({
      id: location.id,
      name: location.name,
      type: location.type,
      address: location.address,
      phone: location.phone,
      externalId: location.externalId ?? null,
      isMainUnit: location.isMainUnit ?? false,
      isActive: location.isActive,
      createdAt: location.createdAt,
      updatedAt: location.updatedAt,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toTransferDto(transfer: any): TransferResponseDto {
    return new TransferResponseDto({
      id: transfer.id,
      status: transfer.status,
      notes: transfer.notes,
      fromLocation: new TransferLocationDto({
        id: transfer.fromLocation.id,
        name: transfer.fromLocation.name,
        address: transfer.fromLocation.address,
      }),
      // Ad-hoc destinations have no saved location — synthesize the block from
      // the free-text fields (empty id) so every client renders a name as-is.
      toLocation: transfer.toLocation
        ? new TransferLocationDto({
            id: transfer.toLocation.id,
            name: transfer.toLocation.name,
            address: transfer.toLocation.address,
          })
        : new TransferLocationDto({
            id: '',
            name: transfer.destinationName ?? '',
            address: transfer.destinationAddress ?? null,
          }),
      adhocDestination: !transfer.toLocationId,
      destinationContact: transfer.destinationContact ?? null,
      createdBy: new TransferUserDto({
        id: transfer.createdBy.id,
        firstName: transfer.createdBy.firstName,
        lastName: transfer.createdBy.lastName,
      }),
      assignedTo: transfer.assignedTo
        ? new TransferUserDto({
            id: transfer.assignedTo.id,
            firstName: transfer.assignedTo.firstName,
            lastName: transfer.assignedTo.lastName,
          })
        : null,
      items: transfer.items.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (item: any) =>
          new TransferItemResponseDto({
            id: item.id,
            rawMaterialId: item.rawMaterialId,
            recipeId: item.recipeId,
            rawMaterialTitle: item.rawMaterial?.title ?? item.recipe?.name ?? '',
            quantity: Number(item.quantity),
            unit: item.unit,
          }),
      ),
      approval: transfer.approval
        ? new TransferApprovalDto({
            status: transfer.approval.status,
            reason: transfer.approval.reason,
            approvedById: transfer.approval.approvedById,
          })
        : null,
      delegateIdCard: transfer.delegateIdCard ?? null,
      transportMeans: transfer.transportMeans ?? null,
      dispatchedAt: transfer.dispatchedAt ?? null,
      receiverName: transfer.receiverName ?? null,
      receivedAt: transfer.receivedAt ?? null,
      // Derive from receivedAt (always loaded, set atomically with the signature)
      // so list queries can `omit` the signature blob and still report this.
      hasReceiverSignature: transfer.receivedAt != null,
      completedAt: transfer.completedAt,
      createdAt: transfer.createdAt,
      updatedAt: transfer.updatedAt,
    });
  }
}

/** Trimmed external id; blank → null (clears it). */
function normalizeExternalId(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}
