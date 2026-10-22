import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import * as fs from 'fs';
import { Server, Socket } from 'socket.io';

import { JwtPayload } from '../auth/decorators/current-user.decorator';
import { buildCorsOrigin } from '../../common/cors';

import { StockUpdateDto } from './dto/stock-update.dto';
import { TaskUpdateDto } from './dto/task-update.dto';
import { ActivityEventDto } from './dto/activity-event.dto';

@WebSocketGateway({
  namespace: '/ws',
  cors: {
    // Same wildcard-aware origin list as the HTTP server (decorator runs at
    // module load, before Nest DI — read the env directly).
    origin: buildCorsOrigin(process.env.CORS_ORIGINS ?? '*'),
    credentials: true,
  },
})
export class WebsocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);
  private readonly publicKey: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const publicKeyPath = this.configService.getOrThrow<string>('JWT_PUBLIC_KEY_PATH');
    this.publicKey = fs.readFileSync(publicKeyPath, 'utf8');
  }

  afterInit(): void {
    this.logger.log('WebSocket gateway initialized');
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);

      if (!token) {
        this.logger.warn(`Client ${client.id} rejected: no authentication token provided`);
        client.disconnect(true);
        return;
      }

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        publicKey: this.publicKey,
        algorithms: ['RS256'],
      });

      // Multi-tenancy: tokens without an organizationId predate 1.8.0 —
      // reject so the client reconnects with a refreshed token.
      if (!payload.organizationId) {
        this.logger.warn(`Client ${client.id} rejected: token has no organizationId`);
        client.disconnect(true);
        return;
      }

      // Attach user data to the socket for downstream usage
      client.data.user = payload;

      // All rooms are org-scoped so organizations never see each other's events.
      const org = payload.organizationId;
      await client.join(`org:${org}`);
      await client.join(`org:${org}:role:${payload.role}`);
      await client.join(`user:${payload.userId}`);

      this.logger.log(
        `Client connected: ${client.id} | user=${payload.userId} role=${payload.role} org=${payload.orgSlug}`,
      );
    } catch (error) {
      this.logger.warn(`Client ${client.id} rejected: invalid token — ${(error as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const user: JwtPayload | undefined = client.data?.user;
    const userId = user?.userId ?? 'unknown';
    this.logger.log(`Client disconnected: ${client.id} | user=${userId}`);
  }

  // ----------------------------------------------------------------
  // Broadcast helpers — called by WebsocketService
  // ----------------------------------------------------------------

  broadcastStockUpdate(organizationId: string, materialId: string, data: StockUpdateDto): void {
    this.server.to(`org:${organizationId}`).emit('stock:update', { ...data, materialId });
    this.logger.debug(`stock:update emitted for material ${materialId}`);
  }

  broadcastTaskUpdate(organizationId: string, taskId: string, data: TaskUpdateDto): void {
    this.server.to(`org:${organizationId}`).emit('task:update', { ...data, taskId });
    this.logger.debug(`task:update emitted for task ${taskId}`);
  }

  broadcastLowStockAlert(organizationId: string, materialId: string, data: StockUpdateDto): void {
    // Low-stock alerts target the warehouse role (slug `gestionar`) of the org.
    this.server
      .to(`org:${organizationId}:role:gestionar`)
      .emit('stock:low', { ...data, materialId });
    this.logger.debug(`stock:low alert emitted for material ${materialId}`);
  }

  broadcastActivity(organizationId: string, data: ActivityEventDto): void {
    this.server.to(`org:${organizationId}`).emit('activity:new', {
      ...data,
      id: `activity-${Date.now()}`,
      timestamp: new Date().toISOString(),
    });
    this.logger.debug(`activity:new emitted: ${data.title}`);
  }

  // ----------------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------------

  private extractToken(client: Socket): string | undefined {
    // Prefer handshake.auth.token (Socket.IO v3+ recommended)
    const authToken = client.handshake?.auth?.token as string | undefined;
    if (authToken) {
      return authToken;
    }

    // Fallback to query parameter
    const queryToken = client.handshake?.query?.token as string | undefined;
    return queryToken || undefined;
  }
}
