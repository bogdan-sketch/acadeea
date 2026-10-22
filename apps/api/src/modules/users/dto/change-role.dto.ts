import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ChangeRoleDto {
  @ApiProperty({ description: 'New role ID to assign' })
  @IsUUID()
  roleId: string;
}
