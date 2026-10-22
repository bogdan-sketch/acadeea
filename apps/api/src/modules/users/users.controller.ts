import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '@/modules/auth/casl';
import { CurrentUser, JwtPayload } from '@/modules/auth/decorators/current-user.decorator';
import { ParseUUIDPipe } from '@/common/pipes';
import { PaginatedDto } from '@/common/dto';
import { CreateUserDto, UpdateUserDto, UserResponseDto, UserQueryDto, ChangeRoleDto } from './dto';
import { UsersService } from './users.service';
import { ImagesService, MAX_UPLOAD_BYTES } from '@/modules/images';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('api/v1/users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly images: ImagesService,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', 'User'))
  @ApiOperation({
    summary: 'List users with optional filters',
    description: 'Returns a paginated list of users. Supports isActive, role, and search filters.',
  })
  @ApiOkResponse({ description: 'Paginated list of users' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async findAll(@Query() query: UserQueryDto): Promise<PaginatedDto<UserResponseDto>> {
    return this.usersService.findAll(query);
  }

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('avatar', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiOperation({
    summary: 'Upload my profile photo (multipart field `avatar`, any image up to 60 MB)',
    description: 'Re-encoded server-side to a 512 px square WebP; replaces the previous photo.',
  })
  @ApiOkResponse({ description: 'Me, with the new avatarUrl', type: UserResponseDto })
  async uploadMyAvatar(
    @CurrentUser() user: JwtPayload,
    @UploadedFile()
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined,
  ): Promise<UserResponseDto> {
    const url = await this.images.store('USER_AVATAR', user.userId, file);
    return this.usersService.setAvatarUrl(user.userId, url);
  }

  @Delete('me/avatar')
  @ApiOperation({ summary: 'Remove my profile photo' })
  @ApiOkResponse({ description: 'Me, avatarUrl = null', type: UserResponseDto })
  async deleteMyAvatar(@CurrentUser() user: JwtPayload): Promise<UserResponseDto> {
    await this.images.remove('USER_AVATAR', user.userId);
    return this.usersService.setAvatarUrl(user.userId, null);
  }

  @Post(':id([0-9a-fA-F-]{36})/avatar')
  @CheckPolicies((ability) => ability.can('update', 'User'))
  @UseInterceptors(FileInterceptor('avatar', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiOperation({ summary: "Upload a user's profile photo (admin)" })
  @ApiOkResponse({ type: UserResponseDto })
  async uploadAvatar(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile()
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined,
  ): Promise<UserResponseDto> {
    await this.usersService.findById(id);
    const url = await this.images.store('USER_AVATAR', id, file);
    return this.usersService.setAvatarUrl(id, url);
  }

  @Delete(':id([0-9a-fA-F-]{36})/avatar')
  @CheckPolicies((ability) => ability.can('update', 'User'))
  @ApiOperation({ summary: "Remove a user's profile photo (admin)" })
  @ApiOkResponse({ type: UserResponseDto })
  async deleteAvatar(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    await this.images.remove('USER_AVATAR', id);
    return this.usersService.setAvatarUrl(id, null);
  }

  // Constrain :id to a UUID so it doesn't shadow the literal `/users/invitations`
  // route declared in InvitationsController (same `api/v1/users` base path).
  @Get(':id([0-9a-fA-F-]{36})')
  @CheckPolicies((ability) => ability.can('read', 'User'))
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiOkResponse({ description: 'User found', type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'User not found' })
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.usersService.findById(id);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', 'User'))
  @ApiOperation({ summary: 'Create a new user (admin only)' })
  @ApiCreatedResponse({ description: 'User created', type: UserResponseDto })
  @ApiConflictResponse({ description: 'Email already exists' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', 'User'))
  @ApiOperation({ summary: 'Update a user (admin only)' })
  @ApiOkResponse({ description: 'User updated', type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiConflictResponse({ description: 'Email already exists' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/role')
  @CheckPolicies((ability) => ability.can('update', 'User'))
  @ApiOperation({
    summary: 'Change user role (admin only)',
    description: 'Cannot change own role. Cannot demote the last active admin.',
  })
  @ApiOkResponse({ description: 'Role changed', type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiBadRequestResponse({ description: 'Cannot change own role or last admin' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async changeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<UserResponseDto> {
    return this.usersService.changeRole(id, dto.roleId, user.userId);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', 'User'))
  @ApiOperation({
    summary: 'Deactivate a user (admin only)',
    description: 'Soft-deletes user. Cannot deactivate self or last active admin.',
  })
  @ApiOkResponse({ description: 'User deactivated', type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiBadRequestResponse({ description: 'Cannot deactivate self or last admin' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<UserResponseDto> {
    return this.usersService.deactivate(id, user.userId);
  }

  @Patch(':id/reactivate')
  @CheckPolicies((ability) => ability.can('update', 'User'))
  @ApiOperation({ summary: 'Reactivate a deactivated user (admin only)' })
  @ApiOkResponse({ description: 'User reactivated', type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async reactivate(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.usersService.reactivate(id);
  }
}
