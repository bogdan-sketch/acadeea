import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body for signing a transfer's aviz on delivery (semnatura de primire). The
 * signature image itself is uploaded as multipart (`signature`), not in this DTO.
 */
export class SignTransferAvizDto {
  @ApiProperty({ description: 'Name of the person receiving the goods' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  receiverName: string;
}
