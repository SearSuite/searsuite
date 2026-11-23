import { CSRMatrix, createMatrixRangeReorderOperations } from '@searsuite/sear-domain-matrix';
import { MatrixOT } from '@searsuite/sear-domain-ot';
import { createSheetSortPermutation, SheetSortDirection } from '../src';

const platform = { toLowerCase: (value: string) => value.toLowerCase() };
const compareText = (left: string, right: string) => left.localeCompare(right);

describe('sheet range sorting', () => {
  it('keeps headers, moves full records and independent cell properties together, and leaves blanks last', () => {
    const data = new CSRMatrix<{ type: string; value: string | number }>(undefined, [6, 3]);
    const fills = new CSRMatrix<string>(undefined, [6, 3]);
    const entries: Array<[number, string, string | number, string]> = [
      [0, 'Name', 'Score', 'header'], [1, 'Ada', 30, 'red'], [2, 'Bob', 10, 'blue'],
      [3, 'Cara', 20, 'green'],
    ];
    entries.forEach(([row, name, score, fill]) => {
      data.addItem(row, 0, { type: 'text', value: name });
      data.addItem(row, 1, { type: 'number', value: score });
      fills.addItem(row, 0, fill);
    });
    fills.addItem(4, 0, 'empty-key');
    const range = { start: [0, 0], end: [5, 1] } as const;
    const permutation = createSheetSortPermutation(
      { range, keys: [{ column: 1, direction: SheetSortDirection.Ascending }], firstRowIsHeader: true },
      data,
      (row, column) => data.getItem(row, column)?.value ?? null,
      platform,
      compareText,
    );
    expect(permutation.changed).toBe(true);
    const dataOperations = createMatrixRangeReorderOperations(data, permutation.range, permutation.destinationOf);
    const fillOperations = createMatrixRangeReorderOperations(fills, permutation.range, permutation.destinationOf);
    MatrixOT.apply(data, dataOperations);
    MatrixOT.apply(fills, fillOperations);
    expect([0, 1, 2, 3].map((row) => data.getItem(row, 0)?.value)).toEqual(['Name', 'Bob', 'Cara', 'Ada']);
    expect([0, 1, 2, 3, 4].map((row) => fills.getItem(row, 0)))
      .toEqual(['header', 'blue', 'green', 'red', 'empty-key']);
  });

  it('sorts multiple keys stably and keeps empty keys last in descending order', () => {
    const matrix = new CSRMatrix<{ type: string; value: string | number }>(undefined, [6, 2]);
    const rows: Array<[number, string, number | null]> = [
      [0, 'b', 1], [1, 'A', 2], [2, 'a', 1], [3, 'B', 1], [5, 'a', null],
    ];
    rows.forEach(([row, name, score]) => {
      matrix.addItem(row, 0, { type: 'text', value: name });
      if (score !== null) matrix.addItem(row, 1, { type: 'number', value: score });
    });
    const permutation = createSheetSortPermutation({
      range: { start: [0, 0], end: [5, 1] },
      keys: [
        { column: 0, direction: SheetSortDirection.Ascending },
        { column: 1, direction: SheetSortDirection.Descending },
      ],
    }, matrix, (row, column) => matrix.getItem(row, column)?.value ?? null, platform, compareText);
    expect([0, 1, 2, 3, 4, 5].map(permutation.destinationOf)).toEqual([3, 0, 1, 4, 5, 2]);
  });

  it('maps sparse million-row selections without materializing all row indexes', () => {
    const matrix = new CSRMatrix<{ type: string; value: number }>(undefined, [1_000_000, 2]);
    matrix.addItem(999_999, 0, { type: 'number', value: 1 });
    matrix.addItem(500_000, 0, { type: 'number', value: 2 });
    const permutation = createSheetSortPermutation({
      range: { start: [0, 0], end: [999_999, 1] },
      keys: [{ column: 0, direction: SheetSortDirection.Ascending }],
    }, matrix, (row, column) => matrix.getItem(row, column)?.value ?? null, platform, compareText);
    expect(permutation.destinationOf(999_999)).toBe(0);
    expect(permutation.destinationOf(500_000)).toBe(1);
    expect(permutation.destinationOf(0)).toBe(2);
    expect(createMatrixRangeReorderOperations(matrix, permutation.range, permutation.destinationOf)).toHaveLength(4);
  });

  it('does not generate updates for rows that stay in place', () => {
    const matrix = new CSRMatrix<{ type: string; value: number }>(undefined, [3, 1]);
    matrix.addItem(0, 0, { type: 'number', value: 2 });
    matrix.addItem(1, 0, { type: 'number', value: 1 });
    matrix.addItem(2, 0, { type: 'number', value: 3 });
    const permutation = createSheetSortPermutation({
      range: { start: [0, 0], end: [2, 0] },
      keys: [{ column: 0, direction: SheetSortDirection.Ascending }],
    }, matrix, (row) => matrix.getItem(row, 0)?.value ?? null, platform, compareText);

    expect(createMatrixRangeReorderOperations(matrix, permutation.range, permutation.destinationOf))
      .toHaveLength(2);
  });
});
