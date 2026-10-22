import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { PaginatedDto } from '@/common/dto';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { PushSender } from './push-sender.service';

/** Payload for creating an in-app notification. */
export interface NotifyPayload {
  type: string;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushSender,
  ) {}

  // ── Device tokens ─────────────────────────────

  async registerToken(userId: string, dto: RegisterDeviceTokenDto) {
    await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      update: { userId, platform: dto.platform, updatedAt: new Date() },
      create: { userId, token: dto.token, platform: dto.platform },
    });
    return { success: true };
  }

  async removeToken(token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { token } });
    return { success: true };
  }

  async getTokensForUser(userId: string) {
    return this.prisma.deviceToken.findMany({ where: { userId } });
  }

  // ── In-app inbox ──────────────────────────────

  /**
   * Create an in-app notification for a user (scoped to that user's org) and,
   * best-effort, deliver a push. Resolves the org from the user so it works both
   * inside a request scope and from off-request jobs (the cron already runs
   * inside `runAsOrg`, but resolving here keeps the row correct either way).
   *
   * Notification carries `organizationId`, so the tenant extension would scope
   * it automatically inside a request; we still set it explicitly from the
   * target user so off-request callers (the expiry cron) write the correct org
   * regardless of ambient context (an explicit value is respected, not
   * overwritten).
   */
  async notifyUser(userId: string, payload: NotifyPayload): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });
    if (!user) {
      // Never throw out of a best-effort notify — just skip.
      this.logger.warn(`notifyUser: user ${userId} not found, skipping notification`);
      return;
    }

    await this.prisma.notification.create({
      data: {
        organizationId: user.organizationId,
        userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? Prisma.JsonNull,
      },
    });

    // Best-effort push — never throws (PushSender swallows its own errors).
    await this.push.pushToUser(userId, payload.title, payload.body);
  }

  /** Paginated inbox for the current user, newest first. */
  async listForUser(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedDto<NotificationResponseDto>> {
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);

    const data = rows.map((n) => new NotificationResponseDto(n));
    return new PaginatedDto(data, total, page, limit);
  }

  /** Count of the user's unread notifications. */
  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  /** Mark a single notification read (only the owner's own). */
  async markRead(userId: string, id: string): Promise<NotificationResponseDto> {
    const existing = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!existing) {
      throw new NotFoundException(`Notification with ID "${id}" not found`);
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: existing.readAt ?? new Date() },
    });
    return new NotificationResponseDto(updated);
  }

  /** Mark all of the user's unread notifications read. */
  async markAllRead(userId: string): Promise<{ updated: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }
}
