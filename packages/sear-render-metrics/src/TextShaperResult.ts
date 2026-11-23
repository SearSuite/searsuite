import { type NormalizedTextShapeInput } from './TextShaperInput';
import { type TextShapeResult } from './TextShaperTypes';

/** Validates and freezes an adapter result before it enters the shared cache. */
export function normalizeTextShapeResult(
  input: NormalizedTextShapeInput,
  result: TextShapeResult,
): TextShapeResult {
  if (!result || !Array.isArray(result.glyphs) || !Array.isArray(result.clusters) || !Array.isArray(result.caretStops)) {
    throw new TypeError('TextShaper implementations must return glyphs, clusters, and caretStops arrays.');
  }
  assertFiniteNonNegative(result.width, 'TextShapeResult.width');
  assertFiniteNonNegative(result.height, 'TextShapeResult.height');
  if (result.fontAscent !== undefined) assertFiniteNonNegative(result.fontAscent, 'TextShapeResult.fontAscent');
  if (result.fontDescent !== undefined) assertFiniteNonNegative(result.fontDescent, 'TextShapeResult.fontDescent');
  if (result.fontLineGap !== undefined) assertFiniteNonNegative(result.fontLineGap, 'TextShapeResult.fontLineGap');
  const textLength = input.text.length;
  const glyphs = result.glyphs.map((glyph, index) => {
    assertIntegerInRange(glyph.glyphId, 0, Number.MAX_SAFE_INTEGER, `glyphs[${index}].glyphId`);
    assertIntegerInRange(glyph.cluster, 0, textLength, `glyphs[${index}].cluster`);
    assertFinite(glyph.xAdvance, `glyphs[${index}].xAdvance`);
    assertFinite(glyph.yAdvance, `glyphs[${index}].yAdvance`);
    assertFinite(glyph.xOffset, `glyphs[${index}].xOffset`);
    assertFinite(glyph.yOffset, `glyphs[${index}].yOffset`);
    return Object.freeze({ ...glyph });
  });
  const clusters = result.clusters.map((cluster, index) => {
    assertIntegerInRange(cluster.textStart, 0, textLength, `clusters[${index}].textStart`);
    assertIntegerInRange(cluster.textEnd, cluster.textStart, textLength, `clusters[${index}].textEnd`);
    assertIntegerInRange(cluster.glyphStart, 0, glyphs.length, `clusters[${index}].glyphStart`);
    assertIntegerInRange(cluster.glyphEnd, cluster.glyphStart, glyphs.length, `clusters[${index}].glyphEnd`);
    return Object.freeze({ ...cluster });
  });
  const caretStops = result.caretStops.map((stop, index) => {
    assertIntegerInRange(stop.textOffset, 0, textLength, `caretStops[${index}].textOffset`);
    assertFinite(stop.x, `caretStops[${index}].x`);
    return Object.freeze({ ...stop });
  });
  return Object.freeze({
    glyphs: Object.freeze(glyphs),
    clusters: Object.freeze(clusters),
    caretStops: Object.freeze(caretStops),
    width: result.width,
    height: result.height,
    ...(result.fontAscent !== undefined && { fontAscent: result.fontAscent }),
    ...(result.fontDescent !== undefined && { fontDescent: result.fontDescent }),
    ...(result.fontLineGap !== undefined && { fontLineGap: result.fontLineGap }),
  });
}

function assertFinite(value: number, name: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite.`);
}

function assertFiniteNonNegative(value: number, name: string): void {
  assertFinite(value, name);
  if (value < 0) throw new TypeError(`${name} must be non-negative.`);
}

function assertIntegerInRange(value: number, min: number, max: number, name: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new TypeError(`${name} must be an integer between ${min} and ${max}.`);
  }
}
