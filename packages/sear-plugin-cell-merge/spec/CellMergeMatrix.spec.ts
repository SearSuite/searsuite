import { Rect } from '@searsuite/sear-foundation-rect';
import {
  MatrixOT,
  createUpdateCellOTOperation,
  createInsertRowOTOperation,
  createMoveColOTOperation,
} from '@searsuite/sear-domain-ot';
import { CellMergeMatrix } from '../src';

describe('CellMergeMatrix derived membership index', () => {
  it('never traverses storage when querying an empty million-row sheet', () => {
    const matrix = new CellMergeMatrix(undefined, [1048576, 16384]);
    const traversal = jest.spyOn(matrix, 'forEachStored');
    const storage = matrix as unknown as { indices: number[] };
    let pointerReads = 0;
    storage.indices = new Proxy(storage.indices, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) pointerReads += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    expect(matrix.findRange(0, 0)).toBeNull();
    expect(pointerReads).toBe(0);
    for (let row = 0; row < 400; row += 1) expect(matrix.findRange(row, 2)).toBeNull();
    expect(matrix.getRanges()).toEqual([]);
    expect(traversal).toHaveBeenCalledTimes(1);
  });

  it('builds once from actual anchors and reuses the index across viewport queries', () => {
    const matrix = new CellMergeMatrix(undefined, [1048576, 16384]);
    matrix.setItem(900000, 15000, { endRow: 1048575, endColumn: 16383 });
    const traversal = jest.spyOn(matrix, 'forEachStored');
    expect(matrix.findRange(1048575, 16383)?.shape).toEqual([
      [900000, 15000],
      [1048575, 16383],
    ]);
    for (let row = 0; row < 400; row += 1) expect(matrix.findRange(row, 0)).toBeNull();
    expect(traversal).toHaveBeenCalledTimes(1);
  });

  it('resolves sparse row pointers without walking empty rows', () => {
    const matrix = new CellMergeMatrix(
      {
        data: [{ endRow: 1048575, endColumn: 10 }],
        indices: Array(1048576).fill(0).concat(1),
        indptr: [9],
      },
      [1048576, 16384],
    );
    const storage = matrix as unknown as { indices: number[] };
    let pointerReads = 0;
    storage.indices = new Proxy(storage.indices, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) pointerReads += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    expect(matrix.findRange(1048575, 10)?.getPoint(0)).toEqual([1048575, 9]);
    expect(pointerReads).toBeLessThan(30);
    pointerReads = 0;
    matrix.findRange(1048575, 10);
    expect(pointerReads).toBe(0);
  });

  it('invalidates on updates, removal and empty replacement, with isolated query results', () => {
    const matrix = new CellMergeMatrix(undefined, [10, 10]);
    matrix.setItem(1, 1, { endRow: 2, endColumn: 2 });
    const result = matrix.findRange(2, 2)!;
    result.getPoint(0)[0] = 0;
    expect(matrix.findRange(2, 2)?.getPoint(0)).toEqual([1, 1]);
    matrix.setItem(1, 1, { endRow: 3, endColumn: 3 });
    expect(matrix.findRange(3, 3)).not.toBeNull();
    matrix.removeItem(1, 1);
    expect(matrix.findRange(3, 3)).toBeNull();
    matrix.replaceRanges([
      new Rect([
        [4, 4],
        [5, 5],
      ]),
    ]);
    expect(matrix.findRange(5, 5)).not.toBeNull();
    matrix.replaceRanges([]);
    expect(matrix.findRange(5, 5)).toBeNull();
  });

  it('keeps cloned indexes independent and follows direct MatrixOT changes', () => {
    const matrix = new CellMergeMatrix(undefined, [10, 10]);
    const value = { endRow: 2, endColumn: 2 };
    matrix.setItem(1, 1, value);
    matrix.findRange(2, 2);
    const clone = matrix.clone();
    clone.findRange(2, 2);
    MatrixOT.apply(clone, [createUpdateCellOTOperation([1, 1], null, value)]);
    expect(clone.findRange(2, 2)).toBeNull();
    MatrixOT.apply(clone, [createUpdateCellOTOperation([1, 1], value, null)]);
    expect(clone.findRange(2, 2)).not.toBeNull();
    MatrixOT.apply(clone, [createInsertRowOTOperation([0], Array(10).fill(null))]);
    expect(clone.findRange(2, 1)?.getPoint(0)).toEqual([2, 1]);
    MatrixOT.apply(clone, [createMoveColOTOperation([1], [5])]);
    expect(clone.findRange(2, 1)).toBeNull();
    expect(matrix.findRange(2, 2)?.getPoint(0)).toEqual([1, 1]);
  });

  it('preserves row-major anchor traversal, including several anchors in one row', () => {
    const matrix = new CellMergeMatrix(undefined, [20, 20]);
    matrix.setItem(15, 5, { endRow: 16, endColumn: 6 });
    matrix.setItem(2, 8, { endRow: 3, endColumn: 9 });
    matrix.setItem(2, 1, { endRow: 3, endColumn: 2 });
    expect(matrix.getRanges().map((range) => range.getPoint(0))).toEqual([
      [2, 1],
      [2, 8],
      [15, 5],
    ]);
  });
});
