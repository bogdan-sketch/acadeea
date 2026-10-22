import { Module } from '@nestjs/common';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Injectable,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

import { PrismaModule } from '@/prisma/prisma.module';
import { PrismaService } from '@/prisma/prisma.service';
import { ParseUUIDPipe } from '@/common/pipes';

/**
 * Anchored stakeholder feedback for the public /design-system page.
 * Deliberately UNAUTHENTICATED (no JwtAuthGuard): reviewers have no accounts.
 * Payloads are tightly validated and text is length-capped; the page lives on
 * the test environment.
 */

const PAGES = ['web', 'ios', 'android', 'doc'] as const;

class CreateDesignCommentDto {
  @IsIn(PAGES as unknown as string[])
  page: string;

  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  x: number;

  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  y: number;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  author: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string;

  /** DOM anchor: { anchorText, anchorIndex, dx, dy } — see schema comment. */
  @IsOptional()
  @IsObject()
  anchor?: Record<string, unknown>;
}

@Injectable()
class DesignFeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  list(page?: string) {
    return this.prisma.designComment.findMany({
      where: page ? { page } : undefined,
      orderBy: { createdAt: 'asc' },
    });
  }

  create(dto: CreateDesignCommentDto) {
    return this.prisma.designComment.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { ...dto, anchor: (dto.anchor as any) ?? undefined },
    });
  }

  async resolve(id: string, resolved: boolean) {
    return this.prisma.designComment.update({ where: { id }, data: { resolved } });
  }
}

@ApiTags('Design feedback')
@Controller('api/v1/design-feedback')
class DesignFeedbackController {
  constructor(private readonly service: DesignFeedbackService) {}

  @Get()
  @ApiOperation({ summary: 'List design comments (public)' })
  list(@Query('page') page?: string) {
    return this.service.list(page);
  }

  @Post()
  @ApiOperation({ summary: 'Add an anchored design comment (public)' })
  create(@Body() dto: CreateDesignCommentDto) {
    return this.service.create(dto);
  }

  @Patch(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle resolved on a design comment (public)' })
  resolve(@Param('id', ParseUUIDPipe) id: string, @Body('resolved') resolved?: boolean) {
    return this.service.resolve(id, resolved ?? true);
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [DesignFeedbackController],
  providers: [DesignFeedbackService],
})
export class DesignFeedbackModule {}
