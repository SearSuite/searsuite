import { type CellHighlightStyle } from './CellHighlightRule';

/** A rule matched against the current calculated cell values. */
export interface CellHighlightMatch {
  readonly id: string;
  readonly priority: number;
  readonly style: CellHighlightStyle;
}

/** Read projection shared by queries and independent views. */
export interface CellHighlightMatchReader {
  getHighestPriority(): number;
  readMatches(row: number, column: number): readonly CellHighlightMatch[];
}
