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
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '@/modules/auth/casl';
import { CurrentUser, JwtPayload } from '@/modules/auth/decorators/current-user.decorator';
import { ParseUUIDPipe } from '@/common/pipes';
import { PaginatedDto } from '@/common/dto';
import {
  CreateRecipeDto,
  UpdateRecipeDto,
  RecipeResponseDto,
  RecipeQueryDto,
  ArchiveRecipeDto,
  DraftRecipeDto,
  ResolveRecipeQueryDto,
  RecipeYieldHistoryResponseDto,
  RecipeVersionResponseDto,
  RecipeCostResponseDto,
} from './dto';
import { RecipesService } from './recipes.service';
import { ImagesService, MAX_UPLOAD_BYTES } from '@/modules/images';
import { RecipeResolutionService, ResolvedRecipeTree } from './services/recipe-resolution.service';
import { RecipeNutritionService, RecipeNutritionResult } from './services/recipe-nutrition.service';

@ApiTags('recipes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('api/v1/recipes')
export class RecipesController {
  constructor(
    private readonly recipesService: RecipesService,
    private readonly recipeResolutionService: RecipeResolutionService,
    private readonly recipeNutrition: RecipeNutritionService,
    private readonly images: ImagesService,
  ) {}

  // ── Dynamic Categories ────────────────────────

  // Categories are kind-scoped: ?kind=RECIPE (default) or ?kind=PRODUCT
  // (stock items). 'read Recipe' gates listing; 'manage Recipe' gates edits.
  @Get('categories')
  @CheckPolicies((ability) => ability.can('read', 'Recipe'))
  @ApiOperation({ summary: 'List categories for a kind (RECIPE | PRODUCT)' })
  @ApiOkResponse({ description: 'List of category strings', type: [String] })
  async getCategories(@Query('kind') kind?: string): Promise<string[]> {
    return this.recipesService.getCategories(kind);
  }

  @Get('categories/counts')
  @CheckPolicies((ability) => ability.can('read', 'Recipe'))
  @ApiOperation({ summary: 'Active recipes per category ("" = uncategorized), optional ?type=' })
  async getCategoryCounts(@Query('type') type?: string): Promise<Record<string, number>> {
    return this.recipesService.getCategoryCounts(type);
  }

  @Get('categories/detailed')
  @CheckPolicies((ability) => ability.can('read', 'Recipe'))
  @ApiOperation({ summary: 'List categories with system flag (admin UI)' })
  @ApiOkResponse({ description: 'Categories with isSystem flag' })
  async getCategoryConfigs(
    @Query('kind') kind?: string,
  ): Promise<{ name: string; isSystem: boolean }[]> {
    return this.recipesService.getCategoryConfigs(kind);
  }

  @Get('categories/carousel')
  @CheckPolicies((ability) => ability.can('read', 'Recipe'))
  @ApiOperation({
    summary: 'All categories across kinds with their kind colour (stock carousel)',
  })
  async getCategoryCarousel() {
    return this.recipesService.getCategoryCarousel();
  }

  @Get('super-categories')
  @CheckPolicies((ability) => ability.can('read', 'Recipe'))
  @ApiOperation({ summary: 'List super-categories (dynamic; the top toggle)' })
  async getSuperCategories() {
    return this.recipesService.getSuperCategories();
  }

  @Post('super-categories')
  @CheckPolicies((ability) => ability.can('manage', 'Recipe'))
  @ApiOperation({ summary: 'Create a super-category (name + colour)' })
  async createSuperCategory(@Body('name') name: string, @Body('color') color: string) {
    return this.recipesService.createSuperCategory(name, color);
  }

  @Patch('super-categories/reorder')
  @CheckPolicies((ability) => ability.can('manage', 'Recipe'))
  @ApiOperation({ summary: 'Set the display order of super-categories (admin)' })
  async reorderSuperCategories(@Body('kinds') kinds: string[]) {
    return this.recipesService.reorderSuperCategories(kinds ?? []);
  }

  @Patch('super-categories/:kind')
  @CheckPolicies((ability) => ability.can('manage', 'Recipe'))
  @ApiOperation({ summary: 'Rename / recolour a super-category' })
  async updateSuperCategory(
    @Param('kind') kind: string,
    @Body('name') name?: string,
    @Body('color') color?: string,
  ) {
    return this.recipesService.updateSuperCategory(kind, name, color);
  }

  @Delete('super-categories/:kind')
  @CheckPolicies((ability) => ability.can('manage', 'Recipe'))
  @ApiOperation({ summary: 'Delete a (non-system) super-category and its sub-categories' })
  async deleteSuperCategory(@Param('kind') kind: string) {
    return this.recipesService.deleteSuperCategory(kind);
  }

  @Post('categories')
  @CheckPolicies((ability) => ability.can('manage', 'Recipe'))
  @ApiOperation({ summary: 'Add a category or sub-category (admin)' })
  @ApiCreatedResponse({ description: 'Updated list of categories', type: [String] })
  async addCategory(
    @Body('name') name: string,
    @Body('kind') kind?: string,
    @Body('color') color?: string,
    @Body('parentName') parentName?: string,
  ): Promise<string[]> {
    return this.recipesService.addCategory(name, kind, color, parentName);
  }

  @Patch('categories/reorder-global')
  @CheckPolicies((ability) => ability.can('manage', 'Recipe'))
  @ApiOperation({
    summary:
      'Set a GLOBAL display order across ALL categories (flat drag list; index = display order everywhere, incl. the stock carousel)',
  })
  async reorderAllCategories(@Body('items') items?: { name: string; kind: string }[]) {
    return this.recipesService.reorderAllCategories(items ?? []);
  }

  @Patch('categories/reorder')
  @CheckPolicies((ability) => ability.can('manage', 'Recipe'))
  @ApiOperation({ summary: 'Set the display order of a kind’s categories (admin)' })
  @ApiOkResponse({ description: 'Reordered list of category names', type: [String] })
  async reorderCategories(
    @Body('kind') kind?: string,
    @Body('names') names?: string[],
  ): Promise<string[]> {
    return this.recipesService.reorderCategories(kind, names ?? []);
  }

  @Patch('categories/:name')
  @CheckPolicies((ability) => ability.can('manage', 'Recipe'))
  @ApiOperation({ summary: 'Rename and/or recolour a category (admin)' })
  @ApiOkResponse({ description: 'Updated list of categories', type: [String] })
  async renameCategory(
    @Param('name') name: string,
    @Body('name') newName: string,
    @Body('kind') kind?: string,
    @Body('color') color?: string,
  ): Promise<string[]> {
    return this.recipesService.renameCategory(name, newName, kind, color);
  }

  @Delete('categories/:name')
  @CheckPolicies((ability) => ability.can('manage', 'Recipe'))
  @ApiOperation({ summary: 'Remove a category (admin)' })
  @ApiOkResponse({ description: 'Updated list of categories', type: [String] })
  async removeCategory(
    @Param('name') name: string,
    @Query('kind') kind?: string,
  ): Promise<string[]> {
    return this.recipesService.removeCategory(name, kind);
  }

  // ── Recipes ───────────────────────────────────

  @Get()
  @CheckPolicies((ability) => ability.can('read', 'Recipe') || ability.can('update', 'Task'))
  @ApiOperation({
    summary: 'List all recipes',
    description:
      'Returns a paginated list of recipes. Cofetar users (no read Recipe / no create Task, ' +
      'but update Task) only see recipes from their active tasks. Users who can create ' +
      'tasks (e.g. sef-cofetar) always get the full list.',
  })
  @ApiOkResponse({ description: 'Paginated list of recipes' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async findAll(
    @Query() query: RecipeQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaginatedDto<RecipeResponseDto>> {
    return this.recipesService.findAll(query, user);
  }

  @Get(':id/yield-history')
  @CheckPolicies((ability) => ability.can('read', 'Recipe'))
  @ApiOperation({
    summary: 'Get yield history for a recipe',
    description: 'Returns paginated yield variance history for all batches of this recipe.',
  })
  @ApiOkResponse({ description: 'Paginated yield history' })
  @ApiNotFoundResponse({ description: 'Recipe not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async yieldHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RecipeQueryDto,
  ): Promise<PaginatedDto<RecipeYieldHistoryResponseDto>> {
    return this.recipesService.getYieldHistory(id, query);
  }

  @Get(':id/cost')
  @CheckPolicies((ability) => ability.can('read', 'RecipeCost'))
  @ApiOperation({ summary: 'Calculate recipe cost from ingredient prices' })
  @ApiOkResponse({ description: 'Recipe cost breakdown' })
  @ApiNotFoundResponse({ description: 'Recipe not found' })
  async getRecipeCost(@Param('id', ParseUUIDPipe) id: string): Promise<RecipeCostResponseDto> {
    return this.recipesService.getRecipeCost(id);
  }

  @Get(':id/versions')
  @CheckPolicies((ability) => ability.can('read', 'Recipe'))
  @ApiOperation({ summary: 'Get recipe version history' })
  @ApiOkResponse({ description: 'List of recipe versions' })
  @ApiNotFoundResponse({ description: 'Recipe not found' })
  async getVersionHistory(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RecipeVersionResponseDto[]> {
    return this.recipesService.getVersionHistory(id);
  }

  @Get(':id/nutrition')
  @CheckPolicies((ability) => ability.can('read', 'Recipe'))
  @ApiOperation({
    summary: 'Aggregated nutrition for a recipe',
    description:
      "Sums each ingredient's per-100g/100ml nutrition across the resolved recipe tree " +
      '(semipreparate expanded to raw materials). Reports ingredients without data. ' +
      'Feature-gated client-side by Organization.nutritionEnabled.',
  })
  @ApiOkResponse({ description: 'Recipe nutrition totals + coverage' })
  @ApiNotFoundResponse({ description: 'Recipe not found' })
  async getNutrition(@Param('id', ParseUUIDPipe) id: string): Promise<RecipeNutritionResult> {
    return this.recipeNutrition.forRecipe(id);
  }

  @Get(':id/resolved-tree')
  @CheckPolicies((ability) => ability.can('read', 'Recipe'))
  @ApiOperation({
    summary: 'Resolve recipe tree',
    description:
      'Recursively resolves all ingredients of a recipe to raw materials, ' +
      'expanding inline semipreparate and collecting stocked ones. ' +
      'Returns a flat list of raw materials with scaled quantities.',
  })
  @ApiOkResponse({ description: 'Resolved recipe tree' })
  @ApiNotFoundResponse({ description: 'Recipe not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async resolveTree(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ResolveRecipeQueryDto,
  ): Promise<ResolvedRecipeTree> {
    return this.recipeResolutionService.resolveTree(id, query.quantity, query.unit);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', 'Recipe') || ability.can('update', 'Task'))
  @ApiOperation({
    summary: 'Get recipe by ID',
    description:
      'Returns a single recipe with all nested components and ingredients. ' +
      'Cofetar users (no read Recipe / no create Task) can only access recipes ' +
      'from their active (IN_LUCRU) tasks.',
  })
  @ApiOkResponse({ description: 'Recipe found', type: RecipeResponseDto })
  @ApiNotFoundResponse({ description: 'Recipe not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<RecipeResponseDto> {
    return this.recipesService.findById(id, user);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', 'Recipe'))
  @ApiOperation({
    summary: 'Create a new recipe',
    description:
      'Creates a new recipe with all nested components and ingredients in a single request.',
  })
  @ApiCreatedResponse({ description: 'Recipe created successfully', type: RecipeResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async create(
    @Body() dto: CreateRecipeDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<RecipeResponseDto> {
    return this.recipesService.create(dto, user.userId);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', 'Recipe'))
  @ApiOperation({
    summary: 'Update a recipe',
    description:
      'Partially updates a recipe. Scalar fields are merged; nested arrays (components) use full replacement when provided.',
  })
  @ApiOkResponse({ description: 'Recipe updated successfully', type: RecipeResponseDto })
  @ApiNotFoundResponse({ description: 'Recipe not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecipeDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<RecipeResponseDto> {
    return this.recipesService.update(id, dto, user.userId);
  }

  @Post(':id/photo')
  @CheckPolicies((ability) => ability.can('update', 'Recipe'))
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiOperation({
    summary: 'Upload the recipe photo (multipart field `photo`, any image up to 60 MB)',
    description:
      'The image is re-encoded server-side to WebP (max 1600 px on the long side, EXIF rotation ' +
      'applied) and replaces the previous photo. `photoUrl` becomes /api/v1/images/<id>.',
  })
  @ApiOkResponse({ description: 'Recipe with the new photoUrl', type: RecipeResponseDto })
  @ApiNotFoundResponse({ description: 'Recipe not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async uploadPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile()
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined,
  ): Promise<RecipeResponseDto> {
    await this.recipesService.findById(id);
    const url = await this.images.store('RECIPE', id, file);
    return this.recipesService.setPhotoUrl(id, url);
  }

  @Delete(':id/photo')
  @CheckPolicies((ability) => ability.can('update', 'Recipe'))
  @ApiOperation({ summary: 'Remove the recipe photo' })
  @ApiOkResponse({ description: 'Recipe with photoUrl = null', type: RecipeResponseDto })
  async deletePhoto(@Param('id', ParseUUIDPipe) id: string): Promise<RecipeResponseDto> {
    await this.images.remove('RECIPE', id);
    return this.recipesService.setPhotoUrl(id, null);
  }

  @Patch(':id/archive')
  @CheckPolicies((ability) => ability.can('update', 'Recipe'))
  @ApiOperation({
    summary: 'Archive / unarchive a recipe',
    description:
      'Archived recipes are hidden from default listings and pickers but keep their ' +
      'production/order history. Separate from PATCH /recipes/:id so the flag never ' +
      'touches recipe versioning.',
  })
  @ApiOkResponse({ description: 'Recipe archive state updated', type: RecipeResponseDto })
  @ApiNotFoundResponse({ description: 'Recipe not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async setArchived(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ArchiveRecipeDto,
  ): Promise<RecipeResponseDto> {
    return this.recipesService.setArchived(id, dto.archived);
  }

  @Patch(':id/draft')
  @CheckPolicies((ability) => ability.can('update', 'Recipe'))
  @ApiOperation({
    summary: 'Mark a recipe as draft / publish it',
    description:
      'Draft recipes are works-in-progress: hidden from default listings and pickers ' +
      'and blocked from production, orders and stock. Separate from PATCH /recipes/:id ' +
      'so the flag never touches recipe versioning.',
  })
  @ApiOkResponse({ description: 'Recipe draft state updated', type: RecipeResponseDto })
  @ApiNotFoundResponse({ description: 'Recipe not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async setDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DraftRecipeDto,
  ): Promise<RecipeResponseDto> {
    return this.recipesService.setDraft(id, dto.draft);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', 'Recipe'))
  @ApiOperation({
    summary: 'Delete a recipe',
    description: 'Permanently deletes a recipe and all its children (components, ingredients).',
  })
  @ApiOkResponse({ description: 'Recipe deleted successfully', type: RecipeResponseDto })
  @ApiNotFoundResponse({ description: 'Recipe not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<RecipeResponseDto> {
    return this.recipesService.remove(id);
  }
}
