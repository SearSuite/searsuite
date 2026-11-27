import { type TextAttributeRange } from '@searsuite/sear-domain-doc';
import { type HexColor } from '@searsuite/sear-foundation-utils';

export const CellRangeHighlightKind = {
  CellRange: 'cellRange',
  ColumnRange: 'columnRange',
  RowRange: 'rowRange',
} as const;

/** Type contract for CellRangeHighlightKind. */
export type CellRangeHighlightKind = (typeof CellRangeHighlightKind)[keyof typeof CellRangeHighlightKind];

/** A sheet rectangle rendered as part of an editor highlight. */
export interface CellRangeHighlight {
  kind?: typeof CellRangeHighlightKind.CellRange;
  start: [number, number];
  end: [number, number];
  color: HexColor;
  /** Optional translucent fill rendered beneath the range outline. */
  fill?: string;
}

/** Public contract for ColumnRangeHighlight. */
export interface ColumnRangeHighlight {
  kind: typeof CellRangeHighlightKind.ColumnRange;
  startCol: number;
  endCol: number;
  color: HexColor;
  fill?: string;
}

/** Public contract for RowRangeHighlight. */
export interface RowRangeHighlight {
  kind: typeof CellRangeHighlightKind.RowRange;
  startRow: number;
  endRow: number;
  color: HexColor;
  fill?: string;
}

/** Type contract for SheetReferenceHighlight. */
export type SheetReferenceHighlight = CellRangeHighlight | ColumnRangeHighlight | RowRangeHighlight;

/** Presentation-only output shared by all editor highlighters. */
export interface Highlighting {
  cellRanges: SheetReferenceHighlight[];
  textAttributes: TextAttributeRange[];
}

/** Generic editor state that can influence a highlighter's presentation. */
export interface HighlightContext {
  /** Zero-based cursor position in the editor's plain-text content. */
  cursorOffset?: number;
}

/**
 * Extensible editor highlighting contract.
 *
 * Implementations translate an editor's current text into generic text styles
 * and optional sheet ranges. They must not mutate the editing document.
 */
export abstract class Highlighter {
  /** DI token for resolving Highlighter. */
  public static readonly symbol: symbol = Symbol.for('Highlighter');

  /** Returns highlighted segments for the supplied source range. */
  public abstract highlight(text: string, context?: HighlightContext): Highlighting;

  /** Releases any session-scoped resources. Stateless highlighters need not override this. */
  public clear(): void {}
}
