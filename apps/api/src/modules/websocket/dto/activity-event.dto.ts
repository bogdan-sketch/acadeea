import { IsObject, IsOptional, IsString } from 'class-validator';

export class ActivityEventDto {
  @IsString()
  type: string;

  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsObject()
  metadata?: {
    taskId?: string;
    orderId?: string;
    materialId?: string;
    userId?: string;
    userName?: string;
  };
}
