import { Module } from '@nestjs/common';

import { PrismaModule } from '@/prisma/prisma.module';
import { CaslModule } from '@/modules/auth/casl';
import { UnitConversionsModule } from '@/modules/unit-conversions';
import { ImagesModule } from '@/modules/images';
import { RecipesController } from './recipes.controller';
import { RecipesService } from './recipes.service';
import { RecipeResolutionService } from './services/recipe-resolution.service';
import { RecipeNutritionService } from './services/recipe-nutrition.service';

@Module({
  imports: [PrismaModule, CaslModule, UnitConversionsModule, ImagesModule],
  controllers: [RecipesController],
  providers: [RecipesService, RecipeResolutionService, RecipeNutritionService],
  exports: [RecipesService, RecipeResolutionService, RecipeNutritionService],
})
export class RecipesModule {}
