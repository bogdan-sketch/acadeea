export { StockModule } from './stock.module';
export { StockService } from './stock.service';
export { StockReservationService } from './services/stock-reservation.service';
export { consumeRecipeLotsFifo } from './recipe-lot-fifo.util';
export type { MaterialRequirement } from './services/stock-reservation.service';
export {
  CreateStockMovementDto,
  StockMovementResponseDto,
  StockMovementQueryDto,
  RecipeStockQueryDto,
  RecipeStockResponseDto,
  CreateRecipeMovementDto,
} from './dto';
