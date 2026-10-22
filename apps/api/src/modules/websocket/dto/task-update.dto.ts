import { IsString, IsUUID } from 'class-validator';

export class TaskUpdateDto {
  @IsUUID()
  taskId: string;

  @IsString()
  taskTitle: string;

  @IsString()
  newStatus: string;

  @IsUUID()
  assignedToId: string;
}
