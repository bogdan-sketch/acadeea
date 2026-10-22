import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '@/modules/auth/casl';
import { ParseUUIDPipe } from '@/common/pipes';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto, UpdateSupplierDto, SupplierResponseDto } from './dto';

@ApiTags('suppliers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('api/v1/suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', 'RawMaterial'))
  @ApiOperation({ summary: 'List suppliers with their materials and low-stock counts' })
  @ApiOkResponse({ type: [SupplierResponseDto] })
  async findAll(): Promise<SupplierResponseDto[]> {
    return this.suppliersService.findAll();
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', 'RawMaterial'))
  @ApiOkResponse({ type: SupplierResponseDto })
  @ApiNotFoundResponse()
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<SupplierResponseDto> {
    return this.suppliersService.findById(id);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('manage', 'RawMaterial'))
  @ApiCreatedResponse({ type: SupplierResponseDto })
  async create(@Body() dto: CreateSupplierDto): Promise<SupplierResponseDto> {
    return this.suppliersService.create(dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('manage', 'RawMaterial'))
  @ApiOkResponse({ type: SupplierResponseDto })
  @ApiNotFoundResponse()
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
  ): Promise<SupplierResponseDto> {
    return this.suppliersService.update(id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('manage', 'RawMaterial'))
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.suppliersService.remove(id);
  }
}
