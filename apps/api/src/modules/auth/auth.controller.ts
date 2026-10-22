import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from './decorators/current-user.decorator';
import {
  LoginDto,
  RefreshTokenDto,
  AuthResponseDto,
  TokenResponseDto,
  RedeemHandoffDto,
  ProviderSignInDto,
  LinkProviderDto,
  DeleteAccountDto,
} from './dto';

type ProviderName = 'apple' | 'google';
function parseProvider(value: string): ProviderName {
  if (value === 'apple' || value === 'google') return value;
  throw new BadRequestException('Unsupported provider');
}

@ApiTags('auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/login
  // ---------------------------------------------------------------------------

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // brute-force protection
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Account deactivated' })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto.email, dto.password);
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/refresh
  // ---------------------------------------------------------------------------

  @Post('refresh')
  // A whole shop shares one IP: every phone refreshes on launch, so the
  // brute-force limit here is per minute per IP but wide enough for a team.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token (token rotation)' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed', type: TokenResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Body() dto: RefreshTokenDto): Promise<TokenResponseDto> {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/handoff/redeem
  // ---------------------------------------------------------------------------

  @Post('handoff/redeem')
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // brute-force protection
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Redeem a single-use login handoff code (apex → org subdomain session transfer)',
  })
  @ApiResponse({ status: 200, description: 'Handoff successful', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid, expired or already-used code' })
  async redeemHandoff(@Body() dto: RedeemHandoffDto): Promise<AuthResponseDto> {
    return this.authService.redeemHandoff(dto.code);
  }

  // ---------------------------------------------------------------------------
  // POST /api/v1/auth/logout
  // ---------------------------------------------------------------------------

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke refresh token (logout)' })
  @ApiResponse({ status: 204, description: 'Logged out successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(@CurrentUser() user: JwtPayload, @Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(user.userId, dto.refreshToken);
  }

  // ---------------------------------------------------------------------------
  // GET /api/v1/auth/me
  // ---------------------------------------------------------------------------

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Current user profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async me(@CurrentUser() user: JwtPayload) {
    return this.authService.validateUser(user.userId);
  }

  // ---------------------------------------------------------------------------
  // Social sign-in (Apple / Google)
  // ---------------------------------------------------------------------------

  @Post('apple')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in / invite sign-up with Apple' })
  @ApiResponse({ status: 200, description: 'Authenticated', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid token or no account (PROVIDER_NO_ACCOUNT)' })
  async apple(@Body() dto: ProviderSignInDto): Promise<AuthResponseDto> {
    return this.authService.signInWithProvider('apple', dto);
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in / invite sign-up with Google' })
  @ApiResponse({ status: 200, description: 'Authenticated', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid token or no account (PROVIDER_NO_ACCOUNT)' })
  async google(@Body() dto: ProviderSignInDto): Promise<AuthResponseDto> {
    return this.authService.signInWithProvider('google', dto);
  }

  @Post('link/:provider')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Link a social identity to the current account' })
  @ApiResponse({ status: 200, description: 'Linked; returns linkedProviders' })
  @ApiResponse({ status: 409, description: 'Identity already linked (PROVIDER_ALREADY_LINKED)' })
  async link(
    @CurrentUser() user: JwtPayload,
    @Param('provider') provider: string,
    @Body() dto: LinkProviderDto,
  ) {
    return this.authService.linkProvider(user.userId, parseProvider(provider), dto);
  }

  @Delete('link/:provider')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unlink a social identity from the current account' })
  @ApiResponse({ status: 200, description: 'Unlinked; returns linkedProviders' })
  @ApiResponse({ status: 400, description: 'Only remaining login method (LAST_LOGIN_METHOD)' })
  async unlink(@CurrentUser() user: JwtPayload, @Param('provider') provider: string) {
    return this.authService.unlinkProvider(user.userId, parseProvider(provider));
  }

  // ---------------------------------------------------------------------------
  // DELETE /api/v1/auth/account  — self-service account deletion
  // ---------------------------------------------------------------------------

  @Delete('account')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete your own account (self-service)',
    description:
      'Confirms the current password, then anonymizes PII, deactivates the account, ' +
      'unlinks social identities and revokes all sessions. Blocked for the last active ' +
      'administrator of an organization.',
  })
  @ApiResponse({ status: 200, description: 'Account deleted' })
  @ApiResponse({
    status: 400,
    description:
      'Incorrect password (INVALID_PASSWORD), last active admin (LAST_ACTIVE_ADMIN), ' +
      'or password required for provider-only account (PASSWORD_REQUIRED)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized (missing/expired session)' })
  async deleteAccount(
    @CurrentUser() user: JwtPayload,
    @Body() dto: DeleteAccountDto,
  ): Promise<{ deleted: true }> {
    return this.authService.deleteOwnAccount(user.userId, dto.password);
  }
}
