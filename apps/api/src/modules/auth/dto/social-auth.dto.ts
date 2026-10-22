import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** Body for POST /auth/apple and POST /auth/google. */
export class ProviderSignInDto {
  @ApiProperty({ description: 'Provider id_token (Apple identityToken / Google credential)' })
  @IsString()
  identityToken: string;

  @ApiPropertyOptional({ description: 'Raw nonce the client used, if any' })
  @IsOptional()
  @IsString()
  nonce?: string;

  @ApiPropertyOptional({ description: 'Invitation token — required to sign up (invite-only)' })
  @IsOptional()
  @IsString()
  invitationToken?: string;

  @ApiPropertyOptional({ description: 'First name (Apple returns it only on first consent)' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name (Apple returns it only on first consent)' })
  @IsOptional()
  @IsString()
  lastName?: string;
}

/** Body for POST /auth/link/:provider. */
export class LinkProviderDto {
  @ApiProperty({ description: 'Provider id_token for the identity to link' })
  @IsString()
  identityToken: string;

  @ApiPropertyOptional({ description: 'Raw nonce the client used, if any' })
  @IsOptional()
  @IsString()
  nonce?: string;
}
