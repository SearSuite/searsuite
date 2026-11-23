import { CellHighlightKind } from '../src';
import { computeCellHighlightRangeThreshold } from '../src/CellHighlightRangeStatistics';

const values = [2, 5, 5, 9, 11, 11, 20];
const visitValues = (_sr: number, _sc: number, _er: number, _ec: number, visit: (value: number) => void) =>
  values.forEach(visit);

describe('cell highlight range statistics', () => {
  it('selects top and bottom boundaries, including tied values', () => {
    expect(computeCellHighlightRangeThreshold({ kind: CellHighlightKind.Top, count: 2 }, 0, 0, 6, 0, visitValues)).toBe(11);
    expect(computeCellHighlightRangeThreshold({ kind: CellHighlightKind.Bottom, count: 2 }, 0, 0, 6, 0, visitValues)).toBe(5);
    expect(computeCellHighlightRangeThreshold({ kind: CellHighlightKind.Top, count: 30, percent: true }, 0, 0, 6, 0, visitValues)).toBe(11);
    expect(computeCellHighlightRangeThreshold({ kind: CellHighlightKind.Bottom, count: 30, percent: true }, 0, 0, 6, 0, visitValues)).toBe(5);
  });

  it('computes the mean and handles ranges with no finite numeric values', () => {
    expect(computeCellHighlightRangeThreshold({ kind: CellHighlightKind.AboveAverage }, 0, 0, 6, 0, visitValues))
      .toBeCloseTo(9);
    expect(computeCellHighlightRangeThreshold({ kind: CellHighlightKind.Top, count: 1 }, 0, 0, 6, 0, (_a, _b, _c, _d, visit) => {
      visit(NaN);
      visit(Infinity);
    })).toBeNull();
  });

  it('BUG-440 keeps the average finite when large values cancel', () => {
    const largeValues = [1e308, -1e308, 0];
    const threshold = computeCellHighlightRangeThreshold(
      { kind: CellHighlightKind.AboveAverage }, 181, 3, 183, 3,
      (_sr, _sc, _er, _ec, visit) => largeValues.forEach(visit),
    );
    expect(threshold).toBe(0);
    expect(largeValues.map((value) => value > threshold!)).toEqual([true, false, false]);
    const ordinaryValues = [100, -100, 0];
    expect(computeCellHighlightRangeThreshold(
      { kind: CellHighlightKind.AboveAverage }, 181, 4, 183, 4,
      (_sr, _sc, _er, _ec, visit) => ordinaryValues.forEach(visit),
    )).toBe(0);
  });
});
