/**
 * Platform-neutral text shaping and glyph measurement contracts.
 *
 * @packageDocumentation
 */

export { TextShaper } from './TextShaper';
export { RenderContextTextShaper } from './RenderContextTextShaper';
export { TextMeasurementManager } from './TextMeasurementManager';
export { createMeasuredTextShapeResult } from './MeasuredTextShapeResult';
export { type NormalizedTextShapeInput } from './TextShaperInput';
export { createFontDescriptor, type FontDescriptorInput } from './FontDescriptor';
export type {
  ShapedCaretStop,
  ShapedGlyph,
  ShapedTextCluster,
  TextShapeDirection,
  TextShapeFeatureValue,
  TextShapeInput,
  TextShapeResult,
} from './TextShaperTypes';
