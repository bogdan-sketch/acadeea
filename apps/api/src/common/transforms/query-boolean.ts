import { Transform } from 'class-transformer';

/**
 * Query-string boolean. Maps only the raw "true" / "false" literals; anything
 * else passes through so @IsBoolean can reject it.
 *
 * Reads `obj[key]` (the raw string), NOT `value`: the global ValidationPipe
 * runs with `enableImplicitConversion`, which has already turned the string
 * into Boolean(value) before custom transforms run — so `value` is `true` for
 * "false" and a `value === 'false'` check can never match.
 */
export const QueryBoolean = (): PropertyDecorator =>
  Transform(({ obj, key }) => {
    const raw = (obj as Record<string, unknown>)[key];
    return raw === 'true' ? true : raw === 'false' ? false : raw;
  });
