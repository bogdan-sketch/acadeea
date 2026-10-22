import { ApiProperty } from '@nestjs/swagger';

export class ApiErrorDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 400,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Machine-readable error code',
    example: 'BAD_REQUEST',
  })
  errorCode: string;

  @ApiProperty({
    description: 'Human-readable error message',
    example: 'Validation failed',
  })
  message: string;

  @ApiProperty({
    description: 'Unique correlation ID for request tracing',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  correlationId: string;

  @ApiProperty({
    description: 'ISO 8601 timestamp of when the error occurred',
    example: '2024-01-15T10:30:00.000Z',
  })
  timestamp: string;
}
