import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';
import { CaslAbilityFactory } from '@/modules/auth/casl';
import { CreateRoleDto, UpdateRoleDto, SetPermissionsDto, RoleResponseDto } from './dto';

/** Subjects available for permission assignment. */
const AVAILABLE_SUBJECTS = [
  'all',
  'User',
  'RawMaterial',
  'Consumable',
  'Recipe',
  'RecipeCost',
  'Task',
  'StockMovement',
  'StockReservation',
  'UserInvitation',
  'Order',
  'OrderItem',
  'DeliveryNote',
  'Location',
  'StockTransfer',
  'Organization',
  'Role',
] as const;

/** Actions available for permission assignment. */
const AVAILABLE_ACTIONS = ['manage', 'create', 'read', 'update', 'delete'] as const;

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
  ) {}

  async findAll(): Promise<RoleResponseDto[]> {
    const roles = await this.prisma.role.findMany({
      include: {
        permissions: { select: { action: true, subject: true } },
        _count: { select: { users: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return roles.map(
      (r) =>
        new RoleResponseDto({
          id: r.id,
          name: r.name,
          slug: r.slug,
          isSystem: r.isSystem,
          description: r.description,
          permissions: r.permissions,
          userCount: r._count.users,
          createdAt: r.createdAt,
        }),
    );
  }

  async findById(id: string): Promise<RoleResponseDto> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { select: { action: true, subject: true } },
        _count: { select: { users: true } },
      },
    });

    if (!role) {
      throw new NotFoundException(`Role with ID "${id}" not found`);
    }

    return new RoleResponseDto({
      id: role.id,
      name: role.name,
      slug: role.slug,
      isSystem: role.isSystem,
      description: role.description,
      permissions: role.permissions,
      userCount: role._count.users,
      createdAt: role.createdAt,
    });
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // strip diacritics
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async create(dto: CreateRoleDto): Promise<RoleResponseDto> {
    const existingName = await this.prisma.role.findFirst({ where: { name: dto.name } });
    if (existingName) {
      throw new ConflictException(`A role with name "${dto.name}" already exists`);
    }

    const slug = dto.slug ?? this.slugify(dto.name);

    const existingSlug = await this.prisma.role.findFirst({ where: { slug } });
    if (existingSlug) {
      throw new ConflictException(`A role with slug "${slug}" already exists`);
    }

    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
      },
      include: {
        permissions: { select: { action: true, subject: true } },
        _count: { select: { users: true } },
      },
    });

    this.logger.log(`Created role "${role.name}" (${role.slug})`);

    return new RoleResponseDto({
      id: role.id,
      name: role.name,
      slug: role.slug,
      isSystem: role.isSystem,
      description: role.description,
      permissions: role.permissions,
      userCount: role._count.users,
      createdAt: role.createdAt,
    });
  }

  async update(id: string, dto: UpdateRoleDto): Promise<RoleResponseDto> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) {
      throw new NotFoundException(`Role with ID "${id}" not found`);
    }

    if (dto.name && dto.name !== role.name) {
      const existing = await this.prisma.role.findFirst({ where: { name: dto.name } });
      if (existing) {
        throw new ConflictException(`A role with name "${dto.name}" already exists`);
      }
    }

    const updated = await this.prisma.role.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
      },
      include: {
        permissions: { select: { action: true, subject: true } },
        _count: { select: { users: true } },
      },
    });

    this.logger.log(`Updated role "${updated.name}"`);

    return new RoleResponseDto({
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      isSystem: updated.isSystem,
      description: updated.description,
      permissions: updated.permissions,
      userCount: updated._count.users,
      createdAt: updated.createdAt,
    });
  }

  /** Default fallback role slug when a deleted role has users. */
  private static readonly FALLBACK_ROLE_SLUG = 'user';

  async remove(id: string): Promise<void> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });

    if (!role) {
      throw new NotFoundException(`Role with ID "${id}" not found`);
    }

    if (role.isSystem) {
      throw new BadRequestException('Cannot delete a system role');
    }

    // Reassign users to fallback "user" role before deleting
    if (role._count.users > 0) {
      const fallback = await this.prisma.role.findFirst({
        where: { slug: RolesService.FALLBACK_ROLE_SLUG },
      });

      if (!fallback) {
        throw new BadRequestException(
          'Cannot delete role — fallback "user" role does not exist. Run seed first.',
        );
      }

      await this.prisma.user.updateMany({
        where: { roleId: id },
        data: { roleId: fallback.id },
      });

      this.logger.log(
        `Reassigned ${role._count.users} user(s) from "${role.name}" to fallback role "user"`,
      );
    }

    await this.prisma.role.delete({ where: { id } });
    this.logger.log(`Deleted role "${role.name}" (${role.slug})`);
  }

  async setPermissions(id: string, dto: SetPermissionsDto): Promise<RoleResponseDto> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) {
      throw new NotFoundException(`Role with ID "${id}" not found`);
    }

    if (role.slug === 'administrator') {
      throw new BadRequestException('Cannot modify administrator permissions');
    }

    // Replace all permissions in a transaction
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      ...dto.permissions.map((p) =>
        this.prisma.rolePermission.create({
          data: { roleId: id, action: p.action, subject: p.subject },
        }),
      ),
    ]);

    // Invalidate CASL cache for this role
    this.caslAbilityFactory.clearCache(role.slug);

    this.logger.log(`Set ${dto.permissions.length} permissions for role "${role.name}"`);

    return this.findById(id);
  }

  /**
   * Returns available subjects and actions for the UI permission grid.
   */
  getSubjects() {
    return {
      subjects: AVAILABLE_SUBJECTS.filter((s) => s !== 'all'),
      actions: AVAILABLE_ACTIONS.filter((a) => a !== 'manage'),
    };
  }
}
