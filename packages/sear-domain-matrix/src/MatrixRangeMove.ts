import {
  createUpdateCellOTOperation,
  MatrixCellUpdateIntent,
  OTClone,
  type UpdateCellOTOperation,
} from '@searsuite/sear-domain-ot';
import { type CSRMatrix } from './CSRMatrix';

/** Inclusive bounds used by matrix range movement. */
export interface MatrixMoveRange {
  readonly start: readonly [number, number];
  readonly end: readonly [number, number];
}

/** Plans final per-coordinate values from the original matrix, including overlapping ranges. */
export function createMatrixRangeMoveOperations<T>(
  matrix: CSRMatrix<T>,
  source: MatrixMoveRange,
  destination: MatrixMoveRange,
  mapValue: (value: NonNullable<T>, row: number, column: number) => T = (value) => value,
): UpdateCellOTOperation<T | null>[] {
  const final = new Map<string, { row: number; column: number; value: T | null }>();
  const contains = (range: MatrixMoveRange, row: number, column: number) =>
    row >= range.start[0] && row <= range.end[0] && column >= range.start[1] && column <= range.end[1];
  // Sparse destination clears include cells whose corresponding source is empty.
  matrix.forEachStored((_value, row, column) => {
    if (contains(source, row, column) || contains(destination, row, column))
      final.set(`${row}:${column}`, { row, column, value: null });
  });
  matrix.forEachStored((value, row, column) => {
    if (value == null || !contains(source, row, column)) return;
    const targetRow = row + destination.start[0] - source.start[0];
    const targetColumn = column + destination.start[1] - source.start[1];
    final.set(`${targetRow}:${targetColumn}`, {
      row: targetRow,
      column: targetColumn,
      value: mapValue(OTClone(value), targetRow, targetColumn),
    });
  });
  return [...final.values()].flatMap(({ row, column, value }) => {
    const previous = matrix.getItem(row, column);
    if (previous == null && value == null) return [];
    return [createUpdateCellOTOperation([row, column], value, OTClone(previous), MatrixCellUpdateIntent.Relocation)];
  });
}

/** Tests for explicit destination entries not already owned by the source range. */
export function hasMatrixRangeMoveConflict<T>(
  matrix: CSRMatrix<T>,
  source: MatrixMoveRange,
  destination: MatrixMoveRange,
): boolean {
  let conflict = false;
  matrix.forEachStored((value, row, column) => {
    const contains = (range: MatrixMoveRange) =>
      row >= range.start[0] && row <= range.end[0] && column >= range.start[1] && column <= range.end[1];
    if (value != null && contains(destination) && !contains(source)) conflict = true;
  });
  return conflict;
}
