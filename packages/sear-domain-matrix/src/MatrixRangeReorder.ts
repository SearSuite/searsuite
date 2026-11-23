import { createUpdateCellOTOperation, MatrixCellUpdateIntent, OTClone, type UpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { type CSRMatrix } from './CSRMatrix';

/** Reorders only stored cells and clears vacated coordinates from the original snapshot. */
export function createMatrixRangeReorderOperations<T>(
  matrix: CSRMatrix<T>,
  range: { readonly start: readonly [number, number]; readonly end: readonly [number, number] },
  destinationOf: (row: number) => number,
): UpdateCellOTOperation<T | null>[] {
  const final = new Map<string, { row: number; column: number; value: T | null }>();
  matrix.forEachStoredInRange(...range.start, ...range.end, (value, row, column) => {
    if (value == null || destinationOf(row) === row) return;
    final.set(`${row}:${column}`, { row, column, value: null });
  });
  matrix.forEachStoredInRange(...range.start, ...range.end, (value, row, column) => {
    if (value == null || destinationOf(row) === row) return;
    const destination = destinationOf(row);
    final.set(`${destination}:${column}`, { row: destination, column, value: OTClone(value) });
  });
  return [...final.values()].flatMap(({ row, column, value }) => {
    const previous = matrix.getItem(row, column);
    if (previous == null && value == null) return [];
    if (previous === value) return [];
    return [createUpdateCellOTOperation([row, column], value, OTClone(previous), MatrixCellUpdateIntent.Relocation)];
  });
}
