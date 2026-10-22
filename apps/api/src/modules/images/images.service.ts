import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';

import { PrismaService } from '@/prisma/prisma.service';
import { runWithoutTenant } from '@/prisma/tenant-context';

export type ImageKind = 'RECIPE' | 'USER_AVATAR';

/** Per-kind output: the longest side (or the square size for avatars) and the WebP quality. */
const PRESET: Record<ImageKind, { size: number; quality: number; square: boolean }> = {
  RECIPE: { size: 1600, quality: 80, square: false },
  USER_AVATAR: { size: 512, quality: 82, square: true },
};

/** Anything bigger than this never reaches sharp (the multer limit is the first gate). */
export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

export interface UploadedImage {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
}

/**
 * Recipe photos and user avatars. Whatever the client sends (a 50 MB JPEG
 * straight from a phone, a PNG, HEIC/HEIF where libvips supports it) is
 * re-encoded to WebP, downscaled to the preset's size and stored as bytes;
 * one image per owner+kind — a new upload replaces the old one. Images are
 * served publicly by their UUID (unguessable), with long cache headers, so
 * `<img src>` works without a bearer token.
 */
@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Path to put on the owner (`photoUrl` / `avatarUrl`). */
  static pathFor(id: string): string {
    return `/api/v1/images/${id}`;
  }

  async store(kind: ImageKind, ownerId: string, file: UploadedImage | undefined): Promise<string> {
    if (!file?.buffer?.length) throw new BadRequestException('Lipsește fișierul imagine.');
    if (file.buffer.length > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('Fișierul depășește 60 MB.');
    }
    const preset = PRESET[kind];
    let out: Buffer;
    let meta: { width?: number; height?: number };
    try {
      const pipeline = sharp(file.buffer, { failOn: 'none', limitInputPixels: 268_402_689 })
        .rotate() // honour EXIF orientation, then drop the EXIF
        .resize(
          preset.square
            ? { width: preset.size, height: preset.size, fit: 'cover', position: 'attention' }
            : { width: preset.size, height: preset.size, fit: 'inside', withoutEnlargement: true },
        )
        .webp({ quality: preset.quality, effort: 4 });
      const result = await pipeline.toBuffer({ resolveWithObject: true });
      out = result.data;
      meta = result.info;
    } catch (err) {
      this.logger.warn(
        `Image decode failed (${file.mimetype ?? '?'} ${file.buffer.length}B): ${(err as Error).message}`,
      );
      throw new BadRequestException(
        'Fișierul nu este o imagine pe care o putem citi (JPG, PNG, WebP, HEIC).',
      );
    }

    const asset = await this.prisma.$transaction(async (tx) => {
      await tx.imageAsset.deleteMany({ where: { kind, ownerId } });
      return tx.imageAsset.create({
        data: {
          kind,
          ownerId,
          mime: 'image/webp',
          data: new Uint8Array(out),
          width: meta.width ?? 0,
          height: meta.height ?? 0,
          bytes: out.length,
          originalName: file.originalname?.slice(0, 200) ?? null,
          originalBytes: file.size ?? file.buffer.length,
        },
        select: { id: true },
      });
    });
    this.logger.log(
      `${kind} ${ownerId}: ${Math.round(file.buffer.length / 1024)} KB → ${Math.round(out.length / 1024)} KB webp ${meta.width}×${meta.height}`,
    );
    return ImagesService.pathFor(asset.id);
  }

  async remove(kind: ImageKind, ownerId: string): Promise<void> {
    await this.prisma.imageAsset.deleteMany({ where: { kind, ownerId } });
  }

  /** Public read by id — no tenant context on an <img> request. */
  async read(id: string): Promise<{ mime: string; data: Buffer }> {
    const asset = await runWithoutTenant(() =>
      this.prisma.imageAsset.findUnique({ where: { id }, select: { mime: true, data: true } }),
    );
    if (!asset) throw new NotFoundException('Imaginea nu există.');
    return { mime: asset.mime, data: Buffer.from(asset.data) };
  }
}
