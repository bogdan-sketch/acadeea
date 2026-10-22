import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PaginatedDto } from '@/common/dto';
import { ActivityQueryDto, ActivityResponseDto } from './dto';
import { ActivityService } from './activity.service';

@ApiTags('activity')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  @ApiOperation({
    summary: 'Get recent activity feed',
    description:
      'Returns a paginated feed of recent activity aggregated from task transitions, stock movements, and orders.',
  })
  @ApiOkResponse({ description: 'Paginated activity feed' })
  async getActivity(@Query() query: ActivityQueryDto): Promise<PaginatedDto<ActivityResponseDto>> {
    return this.activityService.getRecentActivity(query);
  }
}
