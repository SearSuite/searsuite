import { type TextShapeFeatureValue, type TextShapeInput } from './TextShaperTypes';

/** Input shape passed from the base class to a concrete text-shaper adapter. */
export type NormalizedTextShapeInput = Required<TextShapeInput>;

/** Normalizes optional shaping settings before an adapter is called. */
export function normalizeTextShapeInput(input: TextShapeInput): NormalizedTextShapeInput {
  if (!input || typeof input.text !== 'string') throw new TypeError('TextShapeInput.text must be a string.');
  if (typeof input.font !== 'string' || input.font.length === 0) {
    throw new TypeError('TextShapeInput.font must be a non-empty string.');
  }
  const direction = input.direction ?? 'ltr';
  if (direction !== 'ltr' && direction !== 'rtl') {
    throw new TypeError('TextShapeInput.direction must be "ltr" or "rtl".');
  }
  return {
    text: input.text,
    font: input.font,
    direction,
    language: input.language ?? '',
    script: input.script ?? '',
    features: normalizeFeatures(input.features),
    variations: normalizeVariations(input.variations),
  };
}

/** Creates a stable cache key for one normalized shaping request. */
export function createTextShapeCacheKey(input: NormalizedTextShapeInput): string {
  return JSON.stringify([
    input.text,
    input.font,
    input.direction,
    input.language,
    input.script,
    input.features,
    input.variations,
  ]);
}

function normalizeFeatures(
  values: Readonly<Record<string, TextShapeFeatureValue>> | undefined,
): Readonly<Record<string, TextShapeFeatureValue>> {
  if (!values) return {};
  const normalized: Record<string, TextShapeFeatureValue> = {};
  for (const key of Object.keys(values).sort()) {
    const value = values[key];
    if (typeof value !== 'boolean' && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new TypeError(`Text shaping option "${key}" must be a finite number or boolean.`);
    }
    normalized[key] = value;
  }
  return normalized;
}

function normalizeVariations(values: Readonly<Record<string, number>> | undefined): Readonly<Record<string, number>> {
  if (!values) return {};
  const normalized: Record<string, number> = {};
  for (const key of Object.keys(values).sort()) {
    const value = values[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`Text shaping variation "${key}" must be a finite number.`);
    }
    normalized[key] = value;
  }
  return normalized;
}
