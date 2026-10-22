import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { validate as uuidValidate } from 'uuid';

@Injectable()
export class ParseUUIDPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    // Any RFC 4122 UUID: Prisma writes v4, seeded/imported rows may carry v5.
    if (!uuidValidate(value)) {
      throw new BadRequestException(`Validation failed: "${metadata.data}" must be a valid UUID`);
    }
    return value;
  }
}
