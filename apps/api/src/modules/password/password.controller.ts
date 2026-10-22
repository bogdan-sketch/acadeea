import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { PasswordService } from './password.service';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password.dto';

@ApiTags('auth')
@Controller('api/v1/auth')
export class PasswordController {
  constructor(private readonly passwordService: PasswordService) {}

  @Post('forgot-password')
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // abuse protection (sends email)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Request a password reset link (public)',
    description: 'Always succeeds; emails a reset link only if the account exists and is active.',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.passwordService.requestReset(dto.email);
  }

  @Get('reset-status/:token')
  @ApiOperation({ summary: 'Check a reset token validity (public)' })
  @ApiOkResponse({ description: 'Token status (valid / invalid / expired / used)' })
  async resetStatus(@Param('token') token: string) {
    return this.passwordService.checkToken(token);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Set a new password from a reset/reactivation token (public)',
    description: 'Clears the lock, blocks reuse of the last 3 passwords, revokes sessions.',
  })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.passwordService.resetPassword(dto.token, dto.newPassword);
  }
}
