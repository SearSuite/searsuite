import { CSRMatrix, createMatrixRangeMoveOperations, hasMatrixRangeMoveConflict } from '../src';
import { MatrixOT } from '@searsuite/sear-domain-ot';

describe('matrix range moves', () => {
  it('plans overlapping values from original state and clears empty source destinations', () => {
    const matrix = new CSRMatrix<string>(undefined, [2, 5]);
    matrix.addItem(0, 0, 'a').addItem(0, 1, 'b').addItem(0, 3, 'old');
    const source = { start: [0, 0], end: [0, 2] } as const;
    const destination = { start: [0, 1], end: [0, 3] } as const;
    expect(hasMatrixRangeMoveConflict(matrix, source, destination)).toBe(true);
    const operations = createMatrixRangeMoveOperations(matrix, source, destination);
    expect(matrix.getItem(0, 0)).toBe('a');
    expect(new Set(operations.map((op) => op.p.join(':'))).size).toBe(operations.length);
    MatrixOT.apply(matrix, operations);
    expect([0, 1, 2, 3].map((column) => matrix.getItem(0, column))).toEqual([null, 'a', 'b', null]);
  });

  it('stays sparse for huge empty ranges and isolates mutable payloads', () => {
    const matrix = new CSRMatrix<{ value: string }>(undefined, [1000000, 10]);
    matrix.addItem(0, 0, { value: 'a' });
    const operations = createMatrixRangeMoveOperations(
      matrix,
      { start: [0, 0], end: [999998, 3] },
      { start: [1, 0], end: [999999, 3] },
    );
    expect(operations).toHaveLength(2);
    const value = operations.find((op) => op.p[0] === 1)!.uc.value!;
    value.value = 'b';
    expect(matrix.getItem(0, 0)).toEqual({ value: 'a' });
  });
});
