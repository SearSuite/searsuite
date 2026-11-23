/** Cardinal directions accepted by sheet-selection navigation commands. */
export const SelectionMoveDirection = {
  Up: 'up',
  Down: 'down',
  Left: 'left',
  Right: 'right',
} as const;

/** Type contract for SelectionMoveDirection. */
export type SelectionMoveDirection = (typeof SelectionMoveDirection)[keyof typeof SelectionMoveDirection];
/** Type contract for SheetPoint. */
export type SheetPoint = readonly [number, number];
/** Public contract for a merged-cell range used by selection navigation. */
export interface SheetMergedCellRange {
  readonly start: SheetPoint;
  readonly end: SheetPoint;
}
/** Public contract for MoveSelectionCommandInput. */
export interface MoveSelectionCommandInput {
  readonly focus: SheetPoint;
  readonly direction: SelectionMoveDirection;
  readonly lastRow: number;
  readonly lastCol: number;
  readonly jumpToEdge?: boolean;
  readonly findMerge: (point: SheetPoint) => SheetMergedCellRange | undefined;
}
/** Public contract for MoveSelectionCommandResult. */
export interface MoveSelectionCommandResult {
  readonly anchor: [number, number];
  readonly focus: [number, number];
}

/** Resolves navigation as a sheet interaction, including merged-range boundaries. */
export function moveSelection(input: MoveSelectionCommandInput): MoveSelectionCommandResult {
  const merge = input.findMerge(input.focus);
  const start = merge?.start ?? input.focus;
  const end = merge?.end ?? input.focus;
  let row = input.focus[0];
  let col = input.focus[1];
  if (input.jumpToEdge) {
    if (input.direction === SelectionMoveDirection.Up) row = 0;
    if (input.direction === SelectionMoveDirection.Down) row = input.lastRow;
    if (input.direction === SelectionMoveDirection.Left) col = 0;
    if (input.direction === SelectionMoveDirection.Right) col = input.lastCol;
  } else if (input.direction === SelectionMoveDirection.Up) {
    row = Math.max(start[0] - 1, 0);
    col = start[1];
  } else if (input.direction === SelectionMoveDirection.Down) {
    row = Math.min(end[0] + 1, input.lastRow);
    col = start[1];
  } else if (input.direction === SelectionMoveDirection.Left) {
    row = start[0];
    col = Math.max(start[1] - 1, 0);
  } else {
    row = start[0];
    col = Math.min(end[1] + 1, input.lastCol);
  }
  const target = input.findMerge([row, col]);
  const targetStart = target?.start ?? [row, col];
  const targetEnd = target?.end ?? [row, col];
  return {
    anchor: [targetStart[0], targetStart[1]],
    focus: [targetEnd[0], targetEnd[1]],
  };
}
