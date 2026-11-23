import { CellType, type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { inferSheetSortHeader } from '../src';

describe('inferSheetSortHeader', () => {
  const range = { start: [0, 0], end: [3, 1] } as const;

  it('recognizes text labels above a numeric record column', () => {
    const matrix = new CSRMatrix<CellMatrixElement>(undefined, [4, 2]);
    matrix.addItem(0, 0, { type: CellType.RichText, value: [] });
    matrix.addItem(0, 1, { type: CellType.String, value: 'Rank' });
    matrix.addItem(1, 0, { type: CellType.String, value: 'z' });
    matrix.addItem(1, 1, { type: CellType.Number, value: 3 });
    expect(inferSheetSortHeader(matrix, range)).toBe(true);
  });

  it('sorts the first row when it is a numeric data record', () => {
    const matrix = new CSRMatrix<CellMatrixElement>(undefined, [4, 2]);
    matrix.addItem(0, 0, { type: CellType.String, value: 'd' });
    matrix.addItem(0, 1, { type: CellType.Number, value: 4 });
    matrix.addItem(1, 1, { type: CellType.Number, value: 3 });
    expect(inferSheetSortHeader(matrix, range)).toBe(false);
  });
});
