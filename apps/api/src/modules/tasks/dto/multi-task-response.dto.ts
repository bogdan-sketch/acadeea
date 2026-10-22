import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

import { TaskResponseDto } from './task-response.dto';

export class MultiTaskResponseDto {
  @Expose()
  @ApiProperty({ description: 'Shared group (family) ID of every created task' })
  groupId: string;

  @Expose()
  @ApiProperty({
    description: 'All created tasks (parents; semipreparate tasks are nested as subtasks)',
    type: [TaskResponseDto],
  })
  tasks: TaskResponseDto[];

  constructor(partial: Partial<MultiTaskResponseDto>) {
    Object.assign(this, partial);
  }
}
