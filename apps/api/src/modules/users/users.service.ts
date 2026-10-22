import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { getCurrentTenantId, runWithoutTenant } from '@/prisma/tenant-context';
import { PaginatedDto } from '@/common/dto';
import { PasswordService } from '@/modules/password';
import { CreateUserDto, UpdateUserDto, UserResponseDto, UserQueryDto } from './dto';

/** Fields to select when returning user data — never includes passwordHash. */
const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  dynamicRole: {
    select: { id: true, slug: true, name: true },
  },
} as const;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  /**
   * List users with pagination and optional filters.
   */
  async findAll(query: UserQueryDto): Promise<PaginatedDto<UserResponseDto>> {
    const { page = 1, limit = 20, isActive, roleId, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (roleId) {
      where.roleId = roleId;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    const data = users.map((user) => this.toDto(user));
    return new PaginatedDto(data, total, page, limit);
  }

  /**
   * Find a single user by ID.
   * @throws NotFoundException if the user does not exist.
   */
  async findById(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    return this.toDto(user);
  }

  /**
   * Find a single user by email. Used internally by the auth module.
   * Returns the full user record including passwordHash.
   */
  async findByEmail(email: string) {
    // Emails are globally unique — this existence check looks across orgs.
    return runWithoutTenant(() => this.prisma.user.findUnique({ where: { email } }));
  }

  /**
   * Create a new user. Hashes the password with argon2.
   * `organizationId` is only passed by system flows that know the target org
   * explicitly (accept-invite — the invitation carries the org); normal admin
   * calls leave it undefined and the tenant extension stamps the caller's org.
   * @throws ConflictException if the email is already taken.
   */
  async create(dto: CreateUserDto, organizationId?: string): Promise<UserResponseDto> {
    // Emails are GLOBALLY unique (they resolve the org at apex login) — the
    // uniqueness check must look across all orgs.
    const existing = await runWithoutTenant(() =>
      this.prisma.user.findUnique({ where: { email: dto.email } }),
    );

    if (existing) {
      throw new ConflictException(`A user with email "${dto.email}" already exists`);
    }

    // Verify role exists (scoped to the target org)
    const role = await this.prisma.role.findFirst({
      where: { id: dto.roleId, ...(organizationId ? { organizationId } : {}) },
    });
    if (!role) {
      throw new NotFoundException(`Role with ID "${dto.roleId}" not found`);
    }

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        ...(organizationId ? { organizationId } : {}),
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: 'COFETAR', // Legacy enum — will be removed in future migration
        roleId: dto.roleId,
      },
      select: USER_SELECT,
    });

    this.logger.log(`Created user ${user.email} with role ${role.slug}`);
    return this.toDto(user);
  }

  /**
   * Update an existing user. If a new password is provided, it is hashed.
   * @throws NotFoundException if the user does not exist.
   * @throws ConflictException if updating to an email that is already taken.
   */
  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    // Verify the user exists
    const existingUser = await this.prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    // Check email uniqueness if email is being changed (globally — emails
    // resolve the org at apex login, so they're unique across orgs).
    if (dto.email && dto.email !== existingUser.email) {
      const emailTaken = await runWithoutTenant(() =>
        this.prisma.user.findUnique({ where: { email: dto.email } }),
      );
      if (emailTaken) {
        throw new ConflictException(`A user with email "${dto.email}" already exists`);
      }
    }

    // Build update data, hash password if provided
    const updateData: Record<string, unknown> = {};
    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.firstName !== undefined) updateData.firstName = dto.firstName;
    if (dto.lastName !== undefined) updateData.lastName = dto.lastName;
    if (dto.roleId !== undefined) updateData.roleId = dto.roleId;
    if (dto.password !== undefined) {
      updateData.passwordHash = await argon2.hash(dto.password);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: USER_SELECT,
    });

    this.logger.log(`Updated user ${user.email}`);
    return this.toDto(user);
  }

  /**
   * Soft-delete a user by setting isActive to false.
   * Guards: cannot deactivate self, cannot deactivate last active admin.
   */
  async deactivate(id: string, requestingUserId: string): Promise<UserResponseDto> {
    if (id === requestingUserId) {
      throw new BadRequestException('Cannot deactivate your own account');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { dynamicRole: true },
    });
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    if (user.dynamicRole?.slug === 'administrator') {
      await this.ensureNotLastAdmin(id);
    }

    const deactivated = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: USER_SELECT,
    });
    // End the user's sessions: refresh is refused for inactive users anyway,
    // but revoke the tokens so no device can renew even if reactivated later.
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    this.logger.log(`Deactivated user ${deactivated.email}`);
    return this.toDto(deactivated);
  }

  /**
   * Reactivate a previously deactivated user.
   */
  async reactivate(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    // Reactivate AND lock until the user sets a new password (old one stops working),
    // then email them the set-password link.
    const reactivated = await this.prisma.user.update({
      where: { id },
      data: { isActive: true, lockedAt: new Date(), failedLoginAttempts: 0 },
      select: USER_SELECT,
    });

    // Reactivation happens in the admin's request context — same org.
    const org = getCurrentTenantId()
      ? await this.prisma.organization.findUnique({
          where: { id: getCurrentTenantId() },
          select: { slug: true },
        })
      : null;
    await this.passwordService.sendReactivation(reactivated.id, reactivated.email, org?.slug);

    this.logger.log(`Reactivated user ${reactivated.email} (set-password link sent)`);
    return this.toDto(reactivated);
  }

  /**
   * Change a user's role.
   * Guards: cannot change own role, cannot remove last active admin.
   */
  async changeRole(
    id: string,
    newRoleId: string,
    requestingUserId: string,
  ): Promise<UserResponseDto> {
    if (id === requestingUserId) {
      throw new BadRequestException('Cannot change your own role');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { dynamicRole: true },
    });
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    const newRole = await this.prisma.role.findUnique({ where: { id: newRoleId } });
    if (!newRole) {
      throw new NotFoundException(`Role with ID "${newRoleId}" not found`);
    }

    // If demoting an admin, ensure they're not the last one
    if (user.dynamicRole?.slug === 'administrator' && newRole.slug !== 'administrator') {
      await this.ensureNotLastAdmin(id);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { roleId: newRoleId },
      select: USER_SELECT,
    });

    this.logger.log(`Changed role of ${updated.email} to ${newRole.slug}`);
    return this.toDto(updated);
  }

  /**
   * Throws if `excludeId` is the last active admin.
   */
  private async ensureNotLastAdmin(excludeId: string): Promise<void> {
    const adminRole = await this.prisma.role.findFirst({
      where: { slug: 'administrator' },
    });

    if (!adminRole) return;

    const activeAdminCount = await this.prisma.user.count({
      where: {
        roleId: adminRole.id,
        isActive: true,
        id: { not: excludeId },
      },
    });

    if (activeAdminCount === 0) {
      throw new BadRequestException('Cannot remove or demote the last active administrator');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDto(user: any): UserResponseDto {
    return new UserResponseDto({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.dynamicRole
        ? { id: user.dynamicRole.id, slug: user.dynamicRole.slug, name: user.dynamicRole.name }
        : null,
      isActive: user.isActive,
      avatarUrl: user.avatarUrl ?? null,
      createdAt: user.createdAt,
    });
  }

  /** Profile photo path (set by the images module) or null to clear it. */
  async setAvatarUrl(id: string, avatarUrl: string | null): Promise<UserResponseDto> {
    const user = await this.prisma.user.update({
      where: { id },
      data: { avatarUrl },
      include: { dynamicRole: true },
    });
    return this.toDto(user);
  }
}
