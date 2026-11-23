/** Inclusive source bounds and displacement for reference-preserving cell movement. */
export interface FormulaRangeMove {
  readonly start: readonly [number, number];
  readonly end: readonly [number, number];
  readonly rowOffset: number;
  readonly columnOffset: number;
  /** When supplied, qualified references to this sheet also follow the move. */
  readonly sheetName?: string;
  /** False when inspecting qualified references from a different sheet. */
  readonly includeUnqualified?: boolean;
}
