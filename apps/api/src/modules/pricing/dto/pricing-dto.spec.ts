import { ValidationPipe } from '@nestjs/common';

import { SetManualCostDto, SetSellingPriceDto } from './pricing-response.dto';

// Same options as the global pipe in main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const validate = (metatype: new () => object, value: unknown) =>
  pipe.transform(value, { type: 'body', metatype });

describe('pricing DTOs under the global ValidationPipe', () => {
  it('accepts a selling price (regression: was always 400)', async () => {
    await expect(validate(SetSellingPriceDto, { sellingPrice: 120.5 })).resolves.toEqual({
      sellingPrice: 120.5,
    });
  });

  it('rejects a negative, missing or non-numeric selling price', async () => {
    await expect(validate(SetSellingPriceDto, { sellingPrice: -1 })).rejects.toThrow();
    await expect(validate(SetSellingPriceDto, {})).rejects.toThrow();
    await expect(validate(SetSellingPriceDto, { sellingPrice: 'abc' })).rejects.toThrow();
  });

  it('still accepts a manual cost and null to clear it', async () => {
    await expect(validate(SetManualCostDto, { manualCost: 10 })).resolves.toEqual({
      manualCost: 10,
    });
    await expect(validate(SetManualCostDto, { manualCost: null })).resolves.toEqual({
      manualCost: null,
    });
  });
});
