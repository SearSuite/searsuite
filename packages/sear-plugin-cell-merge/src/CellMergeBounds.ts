/** Inclusive cell-coordinate bounds retained by the derived merge index. */
export interface CellMergeBounds {
  readonly startRow: number;
  readonly startColumn: number;
  readonly endRow: number;
  readonly endColumn: number;
}
