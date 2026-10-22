import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AuthResponseDto } from '@/modules/auth';
import { InvitationsService } from './invitations.service';
import { AcceptInviteDto } from './dto';

@ApiTags('auth')
@Controller('api/v1/auth')
export class AcceptInviteController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get('invite-status/:token')
  @ApiOperation({
    summary: 'Check invitation token validity (public)',
    description: 'Returns whether token is valid, expired, or already used.',
  })
  @ApiOkResponse({ description: 'Token status returned' })
  async inviteStatus(@Param('token') token: string) {
    return this.invitationsService.checkToken(token);
  }

  @Post('accept-invite')
  @ApiOperation({
    summary: 'Accept an invitation and create account (public)',
    description: 'No JWT required. Creates user from invitation token and returns auth tokens.',
  })
  @ApiCreatedResponse({ description: 'Account created, tokens returned', type: AuthResponseDto })
  @ApiNotFoundResponse({ description: 'Invalid invitation token' })
  @ApiBadRequestResponse({ description: 'Invitation expired or already accepted' })
  async acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.invitationsService.acceptInvite(dto);
  }
}
