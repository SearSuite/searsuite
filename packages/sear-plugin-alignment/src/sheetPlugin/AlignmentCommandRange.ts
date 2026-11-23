import { SearError } from '@searsuite/sear-foundation-error';
import { type SheetCellPoint, type SheetRangeBounds, type SheetRangeInput } from '@searsuite/sear-assembly-commands';

/** Sheet dimensions required to validate a range command. */
export interface AlignmentCommandRangeDataSource {
  getRowCount(): number;
  getColumnCount(): number;
}

/** Normalizes a range command input and validates both endpoints. */
export function normalizeAlignmentCommandRange(
  input: SheetRangeInput,
  dataSource: AlignmentCommandRangeDataSource,
): SheetRangeBounds {
  const anchor = normalizePoint(input.anchor, 'range anchor');
  const focus = normalizePoint(input.focus, 'range focus');
  assertPointInBounds(anchor, dataSource, 'range anchor');
  assertPointInBounds(focus, dataSource, 'range focus');
  return {
    start: [Math.min(anchor[0], focus[0]), Math.min(anchor[1], focus[1])],
    end: [Math.max(anchor[0], focus[0]), Math.max(anchor[1], focus[1])],
  };
}

/** Visits every cell in a normalized inclusive range. */
export function forEachAlignmentCell(range: SheetRangeBounds, callback: (row: number, column: number) => void): void {
  for (let row = range.start[0]; row <= range.end[0]; row += 1) {
    for (let column = range.start[1]; column <= range.end[1]; column += 1) callback(row, column);
  }
}

function normalizePoint(point: SheetCellPoint, label: string): SheetCellPoint {
  if (!Array.isArray(point) || point.length !== 2) throw new SearError(`${label} must be a [row, column] coordinate.`);
  const [row, column] = point;
  if (!Number.isInteger(row) || !Number.isInteger(column)) {
    throw new SearError(`${label} must contain integer coordinates.`);
  }
  return [row, column];
}

function assertPointInBounds(point: SheetCellPoint, dataSource: AlignmentCommandRangeDataSource, label: string): void {
  const [row, column] = point;
  if (row < 0 || column < 0 || row >= dataSource.getRowCount() || column >= dataSource.getColumnCount()) {
    throw new SearError(`${label} is outside current sheet bounds.`);
  }
}
