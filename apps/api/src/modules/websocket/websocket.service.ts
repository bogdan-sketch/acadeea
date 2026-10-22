import { Injectable, Logger } from '@nestjs/common';

import { getCurrentTenantId } from '@/prisma/tenant-context';

import { StockUpdateDto } from './dto/stock-update.dto';
import { TaskUpdateDto } from './dto/task-update.dto';
import { ActivityEventDto } from './dto/activity-event.dto';
import { WebsocketGateway } from './websocket.gateway';

/**
 * Realtime emit facade injected into domain services. Every event is
 * org-scoped: the organization comes from the current tenant context
 * (request-scoped AsyncLocalStorage) or an explicit `organizationId` argument
 * (webhook/system flows). If neither is available the event is DROPPED —
 * never broadcast across organizations.
 */
@Injectable()
export class WebsocketService {
  private readonly logger = new Logger(WebsocketService.name);

  constructor(private readonly gateway: WebsocketGateway) {}

  private resolveOrg(explicit?: string): string | undefined {
    const org = explicit ?? getCurrentTenantId();
    if (!org) {
      this.logger.warn('Realtime event dropped: no organization in context');
    }
    return org;
  }

  /** Emit a stock-level change to the org's clients. */
  emitStockUpdate(data: StockUpdateDto, organizationId?: string): void {
    const org = this.resolveOrg(organizationId);
    if (!org) return;
    this.gateway.broadcastStockUpdate(org, data.materialId, data);
  }

  /** Emit a task status change to the org's clients. */
  emitTaskUpdate(data: TaskUpdateDto, organizationId?: string): void {
    const org = this.resolveOrg(organizationId);
    if (!org) return;
    this.gateway.broadcastTaskUpdate(org, data.taskId, data);
  }

  /** Emit a low-stock alert to the org's warehouse role. */
  emitLowStockAlert(data: StockUpdateDto, organizationId?: string): void {
    const org = this.resolveOrg(organizationId);
    if (!org) return;
    this.gateway.broadcastLowStockAlert(org, data.materialId, data);
  }

  /** Emit an activity event to the org's clients. */
  emitActivity(data: ActivityEventDto, organizationId?: string): void {
    const org = this.resolveOrg(organizationId);
    if (!org) return;
    this.gateway.broadcastActivity(org, data);
  }
}
