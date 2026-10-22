import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsString, ValidateNested } from 'class-validator';

export class PermissionRuleDto {
  @ApiProperty({ description: 'Action', example: 'read' })
  @IsString()
  action: string;

  @ApiProperty({ description: 'Subject (resource)', example: 'Recipe' })
  @IsString()
  subject: string;
}

export class SetPermissionsDto {
  @ApiProperty({
    description: 'Full list of permissions (replaces existing)',
    type: [PermissionRuleDto],
  })
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => PermissionRuleDto)
  permissions: PermissionRuleDto[];
}
