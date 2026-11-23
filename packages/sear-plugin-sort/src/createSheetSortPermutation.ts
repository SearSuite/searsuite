import { type CSRMatrix } from '@searsuite/sear-domain-matrix';
import { type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import { type Platform } from '@searsuite/sear-foundation-platform';
import { SheetSortError } from './SheetSortError';
import { SheetSortDirection, type SheetSortRangeInput, type SheetSortValue } from './SheetSortTypes';

export interface SheetSortPermutation {
  readonly range: SheetSortRangeInput['range'];
  readonly destinationOf: (row: number) => number;
  readonly changed: boolean;
}

/** Sorts occupied key rows; rows with empty keys remain stable at the end without being materialized. */
export function createSheetSortPermutation(
  input: SheetSortRangeInput,
  matrix: CSRMatrix<CellMatrixElement>,
  readValue: (row: number, column: number) => SheetSortValue,
  platform: Pick<Platform, 'toLowerCase'>,
  compareText: (left: string, right: string) => number,
): SheetSortPermutation {
  const { range, keys } = input;
  const [startRow, startColumn] = range.start;
  const [endRow, endColumn] = range.end;
  if (![startRow, startColumn, endRow, endColumn].every(Number.isSafeInteger) ||
      startRow < 0 || startColumn < 0 || endRow < startRow || endColumn < startColumn ||
      endRow >= matrix.shape[0] || endColumn >= matrix.shape[1] || !keys.length ||
      keys.some(({ column, direction }) => !Number.isSafeInteger(column) ||
        column < startColumn || column > endColumn || !Object.values(SheetSortDirection).includes(direction))) {
    throw new SheetSortError('Invalid sort range or key.', { input, shape: matrix.shape });
  }
  const dataStart = startRow + (input.firstRowIsHeader ? 1 : 0);
  if (dataStart >= endRow) return { range, destinationOf: (row) => row, changed: false };
  const keyColumns = new Set(keys.map((key) => key.column));
  const rows = new Set<number>();
  const firstKeyColumn = Math.min(...keyColumns);
  const lastKeyColumn = Math.max(...keyColumns);
  matrix.forEachStoredInRange(dataStart, firstKeyColumn, endRow, lastKeyColumn, (cell, row, column) => {
    if (cell != null && keyColumns.has(column)) rows.add(row);
  });
  const values = new Map<number, readonly SheetSortValue[]>();
  const populated = [...rows].filter((row) => {
    const rowValues = keys.map(({ column }) => readValue(row, column));
    values.set(row, rowValues);
    return rowValues.some((value) => value !== null && value !== '');
  });
  populated.sort((left, right) => {
    const a = values.get(left)!;
    const b = values.get(right)!;
    for (let index = 0; index < keys.length; index++) {
      const emptyA = a[index] === null || a[index] === '';
      const emptyB = b[index] === null || b[index] === '';
      if (emptyA !== emptyB) return emptyA ? 1 : -1;
      const order = compareValues(a[index]!, b[index]!, platform, compareText);
      if (order !== 0) return keys[index]!.direction === SheetSortDirection.Descending ? -order : order;
    }
    return left - right;
  });
  const sortedSources = [...populated].sort((a, b) => a - b);
  const destinations = new Map(populated.map((row, index) => [row, dataStart + index]));
  const destinationOf = (row: number): number => {
    const destination = destinations.get(row);
    if (destination !== undefined) return destination;
    return dataStart + populated.length + row - dataStart - countLessThan(sortedSources, row);
  };
  const changed = populated.some((row, index) => row !== dataStart + index);
  return { range: { start: [dataStart, startColumn], end: range.end }, destinationOf, changed };
}

function countLessThan(sorted: readonly number[], value: number): number {
  let low = 0; let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (sorted[middle]! < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function compareValues(
  left: SheetSortValue,
  right: SheetSortValue,
  platform: Pick<Platform, 'toLowerCase'>,
  compareText: (left: string, right: string) => number,
): number {
  if (left === null || left === '' || right === null || right === '') return 0;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  if (typeof left === 'number') return -1;
  if (typeof right === 'number') return 1;
  const a = platform.toLowerCase(String(left));
  const b = platform.toLowerCase(String(right));
  return compareText(a, b);
}
