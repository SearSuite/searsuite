/** Direction of a shaped text run in logical document order. */
export type TextShapeDirection = 'ltr' | 'rtl';

/** OpenType feature value accepted by a text-shaper adapter. */
export type TextShapeFeatureValue = boolean | number;

/** Input passed to a text-shaper implementation. Offsets are UTF-16 offsets. */
export interface TextShapeInput {
  readonly text: string;
  /** Font descriptor understood by the selected shaping implementation. */
  readonly font: string;
  readonly direction?: TextShapeDirection;
  /** ISO/BCP language tag, when known. */
  readonly language?: string;
  /** OpenType script tag, when known. */
  readonly script?: string;
  /** Explicit OpenType feature settings, for example `{ liga: true, kern: true }`. */
  readonly features?: Readonly<Record<string, TextShapeFeatureValue>>;
  /** Variation-axis values for variable fonts, keyed by four-character axis tag. */
  readonly variations?: Readonly<Record<string, number>>;
}

/** One positioned glyph returned by a text-shaping implementation. */
export interface ShapedGlyph {
  readonly glyphId: number;
  /** UTF-16 offset of the source text cluster represented by this glyph. */
  readonly cluster: number;
  readonly xAdvance: number;
  readonly yAdvance: number;
  readonly xOffset: number;
  readonly yOffset: number;
}

/** Mapping between source text and the glyph range generated for it. */
export interface ShapedTextCluster {
  readonly textStart: number;
  readonly textEnd: number;
  readonly glyphStart: number;
  readonly glyphEnd: number;
}

/** A logical caret boundary produced by the shaping implementation. */
export interface ShapedCaretStop {
  /** UTF-16 source-text offset for this caret boundary. */
  readonly textOffset: number;
  /** Advance position in the shaped run's logical direction. */
  readonly x: number;
}

/** Engine-neutral result of shaping one homogeneous text run. */
export interface TextShapeResult {
  readonly glyphs: readonly ShapedGlyph[];
  readonly clusters: readonly ShapedTextCluster[];
  readonly caretStops: readonly ShapedCaretStop[];
  /** Total horizontal advance of the shaped run. */
  readonly width: number;
  /** Total vertical advance, normally zero for horizontal text. */
  readonly height: number;
  readonly fontAscent?: number;
  readonly fontDescent?: number;
  readonly fontLineGap?: number;
}
