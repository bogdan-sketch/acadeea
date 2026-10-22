import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '@/modules/auth/casl';
import { CurrentUser, JwtPayload } from '@/modules/auth/decorators/current-user.decorator';
import { InvitationsService } from './invitations.service';
import { InviteUserDto, InvitationResponseDto } from './dto';

@ApiTags('users')
@Controller('api/v1/users')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post('invite')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', 'UserInvitation'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invite a user by email (admin only)' })
  @ApiCreatedResponse({ description: 'Invitation sent', type: InvitationResponseDto })
  @ApiConflictResponse({ description: 'Active user with this email already exists' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async invite(
    @Body() dto: InviteUserDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<InvitationResponseDto> {
    return this.invitationsService.invite(dto, user.userId);
  }

  @Get('invitations')
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  // Align with GET /users (`read User`): anyone who can open the Users screen can
  // list its invitations. Requiring `manage UserInvitation` here made the Invitați
  // tab 403 for roles that could read users but weren't granted invitation-manage,
  // while Activi/Inactivi loaded fine.
  @CheckPolicies((ability) => ability.can('read', 'User'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all invitations' })
  @ApiOkResponse({ description: 'List of invitations', type: [InvitationResponseDto] })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async findAll(): Promise<InvitationResponseDto[]> {
    return this.invitationsService.findAll();
  }
}
