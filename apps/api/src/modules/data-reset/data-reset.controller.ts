import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '@/modules/auth/casl';
import { CurrentUser, JwtPayload } from '@/modules/auth/decorators/current-user.decorator';
import { DataResetService } from './data-reset.service';
import { DataResetPreviewDto, DataResetResultDto, RunDataResetDto } from './dto';

/**
 * Resetare date — admin (`manage all`) of the CURRENT organization only.
 * Selective wipe of operational data; a safety snapshot is taken first.
 */
@ApiTags('Data Reset')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@CheckPolicies((ability) => ability.can('manage', 'all'))
@Controller('api/v1/data-reset')
export class DataResetController {
  constructor(private readonly dataReset: DataResetService) {}

  @Get('preview')
  @ApiOperation({ summary: 'Categoriile resetabile + câte rânduri ar șterge fiecare (admin)' })
  @ApiOkResponse({ type: DataResetPreviewDto })
  preview(@CurrentUser() user: JwtPayload): Promise<DataResetPreviewDto> {
    return this.dataReset.preview(user.organizationId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Șterge categoriile alese (+ dependențele lor) — necesită confirm: 'RESETEAZA'",
  })
  @ApiOkResponse({ type: DataResetResultDto })
  run(@CurrentUser() user: JwtPayload, @Body() dto: RunDataResetDto): Promise<DataResetResultDto> {
    return this.dataReset.run(
      user.organizationId,
      { userId: user.userId, email: user.email },
      dto.categories,
      dto.confirm,
    );
  }
}
