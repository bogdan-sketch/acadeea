import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '@/modules/auth/casl';
import { OrganizationResponseDto, PublicOrganizationDto, UpdateOrganizationDto } from './dto';
import { LOGO_VARIANTS, LogoVariant, OrganizationService } from './organization.service';

@ApiTags('organization')
@Controller('api/v1/organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get the authenticated user's organization" })
  @ApiOkResponse({ type: OrganizationResponseDto })
  async get(): Promise<OrganizationResponseDto> {
    return this.organizationService.get();
  }

  @Get('by-slug/:slug')
  @ApiOperation({
    summary: 'Public branding lookup by subdomain slug (login/landing theming)',
  })
  @ApiOkResponse({ type: PublicOrganizationDto })
  async getBySlug(@Param('slug') slug: string): Promise<PublicOrganizationDto> {
    return this.organizationService.getBySlug(slug);
  }

  @Get('by-slug/:slug/logo/:variant')
  @ApiOperation({
    summary:
      'Public binary logo for a variant (default|login-light|login-dark|app-light|app-dark) — cacheable; JSON responses reference this instead of embedding multi-MB data URIs',
  })
  async getLogo(
    @Param('slug') slug: string,
    @Param('variant') variant: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (!(variant in LOGO_VARIANTS)) {
      throw new NotFoundException('Logo not found');
    }
    const { mime, data } = await this.organizationService.getLogo(slug, variant as LogoVariant);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=300');
    // Helmet defaults to CORP same-origin, which makes browsers refuse this
    // image on the org subdomains — logos are public branding, allow embedding.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return new StreamableFile(data);
  }

  @Patch()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', 'Organization'))
  @ApiOperation({ summary: 'Update organization branding (admin only)' })
  @ApiOkResponse({ type: OrganizationResponseDto })
  async update(@Body() dto: UpdateOrganizationDto): Promise<OrganizationResponseDto> {
    return this.organizationService.update(dto);
  }

  @Post('logo')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', 'Organization'))
  @UseInterceptors(FileInterceptor('logo'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        logo: { type: 'string', format: 'binary' },
        variant: {
          type: 'string',
          enum: ['login-light', 'login-dark', 'app-light', 'app-dark', 'default'],
        },
      },
      required: ['logo'],
    },
  })
  @ApiOperation({
    summary:
      'Upload organization logo (admin only). variant: login-light|login-dark|app-light|app-dark',
  })
  @ApiOkResponse({ type: OrganizationResponseDto })
  async uploadLogo(
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string },
    @Body('variant') variant?: string,
  ): Promise<OrganizationResponseDto> {
    // Store as data URI for now — can be moved to S3 later
    const base64 = Buffer.from(file.buffer).toString('base64');
    const dataUri = `data:${file.mimetype};base64,${base64}`;
    return this.organizationService.updateLogo(dataUri, variant ?? 'default');
  }

  @Delete('logo')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies((ability) => ability.can('manage', 'Organization'))
  @ApiOperation({ summary: 'Reset a logo variant to default (admin only)' })
  @ApiOkResponse({ type: OrganizationResponseDto })
  async clearLogo(@Query('variant') variant?: string): Promise<OrganizationResponseDto> {
    return this.organizationService.clearLogo(variant ?? 'default');
  }
}
