import { selectRange, type SelectionPoint } from './SelectRangeCommand';
import { SelectionMoveDirection } from './MoveSelectionCommand';
import type { SelectionMoveDirection as SelectionMoveDirectionType } from './MoveSelectionCommand';

/** Input required to extend a sheet selection by keyboard navigation. */
export interface ExtendSelectionCommandInput {
  /** Fixed selection anchor where extension began. */
  readonly origin: SelectionPoint;
  /** Current moving edge before this navigation step. */
  readonly cursor: SelectionPoint;
  /** Direction requested by the user. */
  readonly direction: SelectionMoveDirectionType;
  /** Last valid row index. */
  readonly lastRow: number;
  /** Last valid column index. */
  readonly lastCol: number;
  /** Whether navigation should jump to the sheet edge. */
  readonly jumpToEdge?: boolean;
  /** Data-aware destination resolved by the selection owner. */
  readonly jumpTarget?: SelectionPoint;
  /** Lookup for merged ranges that should be selected as a whole. */
  readonly findMerge: (point: SelectionPoint) => { start: SelectionPoint; end: SelectionPoint } | undefined;
}

/**
 * Extends a selection by one keyboard navigation step.
 * @param input - Current selection extension state.
 * @returns Normalized selection range and updated moving cursor.
 */
export function extendSelection(input: ExtendSelectionCommandInput) {
  let row = input.cursor[0];
  let col = input.cursor[1];
  if (input.direction === SelectionMoveDirection.Up) row = input.jumpToEdge ? 0 : Math.max(0, row - 1);
  if (input.direction === SelectionMoveDirection.Down)
    row = input.jumpToEdge ? input.lastRow : Math.min(input.lastRow, row + 1);
  if (input.direction === SelectionMoveDirection.Left) col = input.jumpToEdge ? 0 : Math.max(0, col - 1);
  if (input.direction === SelectionMoveDirection.Right)
    col = input.jumpToEdge ? input.lastCol : Math.min(input.lastCol, col + 1);
  if (input.jumpTarget) [row, col] = input.jumpTarget;
  const range = selectRange({
    start: input.origin,
    end: [row, col],
    findMerge: input.findMerge,
    lastRow: input.lastRow,
    lastCol: input.lastCol,
  });
  return { ...range, cursor: [row, col] as [number, number] };
}
