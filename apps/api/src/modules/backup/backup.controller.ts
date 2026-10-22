import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream, promises as fs } from 'fs';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '@/modules/auth/casl';
import { PlatformAdminGuard } from '@/modules/organization/platform-admin.guard';
import { BackupService } from './backup.service';

/**
 * Database backup & restore — PLATFORM operator only (PLATFORM_ADMIN_EMAILS).
 * These endpoints operate on the WHOLE database (every tenant's data), so a
 * tenant `administrator` (who has `manage all` inside their org) must NOT
 * reach them — that would be a full cross-tenant export/restore.
 */
@ApiTags('Backups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard, PlatformAdminGuard)
@Controller('api/v1/backups')
export class BackupController {
  constructor(private readonly backups: BackupService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'List automatic daily backups (admin)' })
  list() {
    return this.backups.list();
  }

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'Run the daily backup now (admin)' })
  runNow() {
    return this.backups.runDailyBackup();
  }

  @Post(':name/restore')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'Restore the database from an automatic backup (admin)' })
  async restore(@Param('name') name: string) {
    await this.backups.restoreAutomatic(name);
    return { restored: name };
  }

  @Get('export')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: 'Download a fresh database dump (admin)' })
  async export(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const { filePath, fileName } = await this.backups.exportToTempFile();
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    const stream = createReadStream(filePath);
    stream.on('close', () => void fs.rm(filePath, { force: true }));
    return new StreamableFile(stream);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a dump and restore the database from it (admin)' })
  async import(@UploadedFile() file: { buffer: Buffer; originalname: string }) {
    await this.backups.importAndRestore(file?.buffer);
    return { restored: file.originalname };
  }
}
