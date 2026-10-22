import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@/modules/auth/decorators/current-user.decorator';
import { ParseUUIDPipe } from '@/common/pipes';
import { PaginatedDto } from '@/common/dto';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ── In-app inbox ──────────────────────────────

  @Get()
  @ApiOperation({ summary: "List the current user's notifications (newest first)" })
  @ApiOkResponse({ description: 'Paginated notifications' })
  async list(
    @Query() query: NotificationQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaginatedDto<NotificationResponseDto>> {
    return this.notificationsService.listForUser(user.userId, query.page, query.limit);
  }

  @Get('unread-count')
  @ApiOperation({ summary: "Count of the current user's unread notifications" })
  @ApiOkResponse({ description: 'Unread count' })
  async unreadCount(@CurrentUser() user: JwtPayload): Promise<{ count: number }> {
    return this.notificationsService.unreadCount(user.userId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: "Mark all of the current user's notifications read" })
  @ApiOkResponse({ description: 'Number of notifications marked read' })
  async markAllRead(@CurrentUser() user: JwtPayload): Promise<{ updated: number }> {
    return this.notificationsService.markAllRead(user.userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a single notification read' })
  @ApiOkResponse({ description: 'Notification marked read', type: NotificationResponseDto })
  async markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<NotificationResponseDto> {
    return this.notificationsService.markRead(user.userId, id);
  }

  // ── Device tokens ─────────────────────────────

  @Post('device-token')
  @ApiOperation({ summary: 'Register a device token for push notifications' })
  @ApiCreatedResponse({ description: 'Token registered' })
  async registerToken(@Body() dto: RegisterDeviceTokenDto, @CurrentUser() user: JwtPayload) {
    return this.notificationsService.registerToken(user.userId, dto);
  }

  @Delete('device-token')
  @ApiOperation({ summary: 'Unregister a device token' })
  async removeToken(@Query('token') token: string) {
    return this.notificationsService.removeToken(token);
  }
}
