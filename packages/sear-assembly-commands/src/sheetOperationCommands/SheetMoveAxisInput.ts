/** Moves a contiguous block before a boundary in the original axis (0 through size). */
export interface SheetMoveAxisInput {
  readonly index: number;
  readonly count?: number;
  readonly before: number;
}
