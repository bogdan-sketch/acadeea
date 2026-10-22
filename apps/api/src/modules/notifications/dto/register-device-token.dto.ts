import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class RegisterDeviceTokenDto {
  @ApiProperty({ description: 'FCM or APNs device token' })
  @IsString()
  token: string;

  @ApiProperty({ description: 'Platform', enum: ['ios', 'android'] })
  @IsIn(['ios', 'android'])
  platform: string;
}
