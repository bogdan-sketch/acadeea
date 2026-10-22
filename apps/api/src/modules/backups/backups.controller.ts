import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '@/modules/auth/casl';
import { CurrentUser, JwtPayload } from '@/modules/auth/decorators/current-user.decorator';
import { ParseUUIDPipe } from '@/common/pipes';
import { BackupsService } from './backups.service';
import { CreateSnapshotDto, RestoreSnapshotDto } from './dto';

/**
 * Org snapshots ("Salvează starea") — TENANT-scoped logical backups, admin
 * (`manage all`) of the CURRENT organization only. Distinct from the
 * platform-operator whole-database backups at `api/v1/backups`
 * (modules/backup) — hence the `/snapshots` sub-path, which shares the base
 * prefix without colliding with those routes.
 */
@ApiTags('Org Snapshots')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@CheckPolicies((ability) => ability.can('manage', 'all'))
@Controller('api/v1/backups/snapshots')
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Get()
  @ApiOperation({ summary: 'Listează snapshot-urile organizației curente (admin)' })
  list(@CurrentUser() user: JwtPayload) {
    return this.backups.list(user.organizationId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Creează un snapshot manual acum — „Salvează starea" (admin)' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateSnapshotDto) {
    return this.backups.createSnapshot(user.organizationId, {
      label: dto.label,
      auto: false,
      createdById: user.userId,
    });
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Restaurează organizația dintr-un snapshot (necesită confirm: 'RESTAUREAZA')",
  })
  async restore(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RestoreSnapshotDto,
  ) {
    const restored = await this.backups.restoreSnapshot(user.organizationId, id, dto.confirm);
    return { restored };
  }

  @Get(':id/download')
  @ApiOperation({
    summary: 'Descarcă snapshot-ul .json.gz (suplimentar gated de BACKUP_ADMIN_EMAILS)',
  })
  async download(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    await this.backups.assertDownloadAllowed(user.userId);
    const { stream, fileName } = await this.backups.openDownload(user.organizationId, id);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return new StreamableFile(stream);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Șterge un snapshot (fișier + înregistrare) (admin)' })
  async remove(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.backups.deleteSnapshot(user.organizationId, id);
    return { deleted: id };
  }
}
