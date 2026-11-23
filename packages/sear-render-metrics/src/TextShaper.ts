import {
  createTextShapeCacheKey,
  normalizeTextShapeInput,
  type NormalizedTextShapeInput,
} from './TextShaperInput';
import { normalizeTextShapeResult } from './TextShaperResult';
import { type TextShapeInput, type TextShapeResult } from './TextShaperTypes';

/**
 * Abstract adapter boundary for HarfBuzz, Skia, browser-native, or platform
 * text-shaping implementations.
 *
 * Concrete adapters translate the normalized request to their shaping library
 * and return engine-neutral glyph/cluster data.
 */
export abstract class TextShaper {
  /** DI token for resolving the editor-local text-shaper provider. */
  public static readonly symbol: symbol = Symbol.for('TextShaper');

  private readonly cache = new Map<string, TextShapeResult>();

  /** Shapes one homogeneous text run, reusing an identical cached request. */
  public shape(input: TextShapeInput): TextShapeResult {
    const normalized = normalizeTextShapeInput(input);
    const cacheKey = createTextShapeCacheKey(normalized);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const result = normalizeTextShapeResult(normalized, this.shapeText(normalized));
    this.cache.set(cacheKey, result);
    return result;
  }

  /** Clears all cached shaping results owned by this adapter. */
  public clearCache(): void {
    this.cache.clear();
  }

  /** Shapes one normalized request through the concrete engine adapter. */
  protected abstract shapeText(input: NormalizedTextShapeInput): TextShapeResult;
}
