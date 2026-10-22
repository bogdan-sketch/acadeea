import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { ParseUUIDPipe } from '@/common/pipes';
import { ImagesService } from './images.service';

@ApiTags('images')
@Controller('api/v1/images')
export class ImagesController {
  constructor(private readonly images: ImagesService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Serve an uploaded image (recipe photo / avatar) — public, WebP' })
  @ApiOkResponse({ description: 'image/webp' })
  async serve(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    const { mime, data } = await this.images.read(id);
    res.set({
      'Content-Type': mime,
      'Content-Length': data.length,
      // Immutable: a new upload gets a new id, so this id never changes content.
      'Cache-Control': 'public, max-age=31536000, immutable',
      // helmet defaults to same-origin, which blocks <img> on the web app's host.
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.end(data);
  }
}
