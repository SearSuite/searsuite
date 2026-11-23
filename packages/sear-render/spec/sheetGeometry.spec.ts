import { DimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import type { ScrollManager } from '@searsuite/sear-render-scroll';
import { computeViewportRange, getSheetRangePositionRect } from '../src';

function dimensions(values: number[]): DimensionsCSRMatrix {
  const matrix = new DimensionsCSRMatrix();
  matrix.fromDense([values]);
  return matrix;
}

describe('sheet geometry helpers', () => {
  it('converts inclusive sheet ranges to world rectangles and rejects invalid bounds', () => {
    const rowSizes = dimensions([10, 20, 30]);
    const columnSizes = dimensions([40, 50, 60]);
    const context = { rowSizes, columnSizes, offsetX: 5, offsetY: 7 };

    expect(getSheetRangePositionRect([1, 1], [2, 2], context)).toMatchObject({
      x: 45,
      y: 17,
      width: 110,
      height: 50,
    });
    expect(getSheetRangePositionRect([2, 2], [1, 2], context)).toBeNull();
    expect(getSheetRangePositionRect([-1, 0], [0, 0], context)).toBeNull();
    expect(getSheetRangePositionRect([0, 0], [3, 0], context)).toBeNull();
  });

  it('culls to a buffered viewport slice and falls back safely for out-of-range scroll positions', () => {
    const scroll = {
      getState: () => ({ x: 15, y: 15, deltaX: 0, deltaY: 0 }),
      getShape: () => [20, 20] as [number, number],
    } as unknown as ScrollManager;
    const rowSizes = dimensions([10, 10, 10, 10, 10]);
    const columnSizes = dimensions([10, 10, 10, 10, 10]);

    expect(computeViewportRange(scroll, rowSizes, columnSizes)).toEqual({
      startCol: 0,
      endCol: 4,
      startRow: 0,
      endRow: 4,
    });
    const outside = {
      getState: () => ({ x: 999, y: 999, deltaX: 0, deltaY: 0 }),
      getShape: () => [20, 20] as [number, number],
    } as unknown as ScrollManager;
    expect(computeViewportRange(outside, rowSizes, columnSizes)).toEqual({
      startCol: 0,
      endCol: 4,
      startRow: 0,
      endRow: 4,
    });
  });

  it('does not extend the viewport buffer beyond the last row or column', () => {
    const scroll = {
      getState: () => ({ x: 20, y: 20, deltaX: 0, deltaY: 0 }),
      getShape: () => [10, 10] as [number, number],
    } as unknown as ScrollManager;
    const rowSizes = dimensions([10, 10, 10]);
    const columnSizes = dimensions([10, 10, 10]);

    expect(computeViewportRange(scroll, rowSizes, columnSizes)).toEqual({
      startCol: 0,
      endCol: 2,
      startRow: 0,
      endRow: 2,
    });
  });

  it('keeps viewport ends unchanged when dimension lookups already return the last index', () => {
    const scroll = {
      getState: () => ({ x: 5, y: 5, deltaX: 0, deltaY: 0 }),
      getShape: () => [10, 10] as [number, number],
    } as unknown as ScrollManager;
    const dimensionsAtEnd = {
      shape: [1, 3],
      getLeftBoundaryColIndexByDimension: () => 1,
      getRightBoundaryColIndexByDimension: () => 2,
    } as unknown as DimensionsCSRMatrix;

    expect(computeViewportRange(scroll, dimensionsAtEnd, dimensionsAtEnd)).toEqual({
      startCol: 0,
      endCol: 2,
      startRow: 0,
      endRow: 2,
    });
  });

  it('skips end-bound lookups when the viewport bottom-right is before the sheet origin', () => {
    const scroll = {
      getState: () => ({ x: -20, y: -20, deltaX: 0, deltaY: 0 }),
      getShape: () => [10, 10] as [number, number],
    } as unknown as ScrollManager;
    const rowSizes = dimensions([10, 10, 10]);
    const columnSizes = dimensions([10, 10, 10]);

    expect(computeViewportRange(scroll, rowSizes, columnSizes)).toEqual({
      startCol: 0,
      endCol: 2,
      startRow: 0,
      endRow: 2,
    });
  });
});
