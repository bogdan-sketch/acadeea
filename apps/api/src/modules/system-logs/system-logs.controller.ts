import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma, SystemLogLevel } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { runWithoutTenant } from '@/prisma/tenant-context';
import { PaginatedDto } from '@/common/dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CheckPolicies, PoliciesGuard } from '@/modules/auth/casl';
import { CurrentUser, JwtPayload } from '@/modules/auth/decorators/current-user.decorator';
import { SystemLogQueryDto, SystemLogResponseDto } from './dto/system-log.dto';

const LEVEL_ORDER: SystemLogLevel[] = ['INFO', 'WARN', 'ERROR'];

/**
 * "Jurnal sistem" — read side. Org administrators (`manage all`) see their
 * own organization's entries; platform operators (PLATFORM_ADMIN_EMAILS) can
 * pass `allOrgs=true` to see every org plus system-wide events.
 */
@ApiTags('System logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('api/v1/system-logs')
export class SystemLogsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get('access')
  @ApiOperation({ summary: 'What the caller may see in the system log' })
  access(@CurrentUser() user: JwtPayload): { platformAdmin: boolean } {
    return { platformAdmin: this.isPlatformAdmin(user.email) };
  }

  @Get()
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'Paginated, filterable system log (newest first)' })
  async list(
    @Query() q: SystemLogQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaginatedDto<SystemLogResponseDto>> {
    if (q.allOrgs && !this.isPlatformAdmin(user.email)) {
      throw new ForbiddenException('Doar operatorul platformei vede toate organizațiile.');
    }
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const where: Prisma.SystemLogWhereInput = {};
    if (!q.allOrgs) where.organizationId = user.organizationId;
    if (q.category) where.category = q.category;
    if (q.level) where.level = { in: LEVEL_ORDER.slice(LEVEL_ORDER.indexOf(q.level)) };
    if (q.userId) where.userId = q.userId;
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }
    if (q.search) {
      const contains = q.search.trim();
      where.OR = [
        { message: { contains, mode: 'insensitive' } },
        { action: { contains, mode: 'insensitive' } },
        { path: { contains, mode: 'insensitive' } },
        { userEmail: { contains, mode: 'insensitive' } },
        { correlationId: contains },
      ];
    }

    // Explicit organizationId (or none, for platform view) — bypass the tenant
    // extension so system-wide (null org) rows are reachable for operators.
    const [rows, total] = await runWithoutTenant(() =>
      Promise.all([
        this.prisma.systemLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: { organization: { select: { name: true } } },
        }),
        this.prisma.systemLog.count({ where }),
      ]),
    );

    return new PaginatedDto(
      rows.map(
        (r) =>
          new SystemLogResponseDto({
            id: r.id,
            createdAt: r.createdAt,
            level: r.level,
            category: r.category,
            action: r.action,
            message: r.message,
            organizationId: r.organizationId,
            organizationName: r.organization?.name ?? null,
            userId: r.userId,
            userEmail: r.userEmail,
            method: r.method,
            path: r.path,
            statusCode: r.statusCode,
            durationMs: r.durationMs,
            correlationId: r.correlationId,
            ip: r.ip,
            metadata: r.metadata,
          }),
      ),
      total,
      page,
      limit,
    );
  }

  private isPlatformAdmin(email?: string): boolean {
    if (!email) return false;
    return this.config
      .get<string>('PLATFORM_ADMIN_EMAILS', '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
      .includes(email.toLowerCase());
  }
}
