import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@acadeea.ro' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Reset/reactivation token from the emailed link' })
  @IsString()
  token!: string;

  @ApiProperty({ minLength: 8, description: 'New password (min 8 chars)' })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
