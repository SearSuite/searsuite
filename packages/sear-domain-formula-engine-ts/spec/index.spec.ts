import * as publicApi from '../src/index';

describe('index exports', () => {
  it('should export modules', () => {
    expect(publicApi).toBeDefined();
    expect(Object.keys(publicApi).length).toBeGreaterThan(0);

    // Touch every export binding so re-export getter wrappers are covered.
    expect(publicApi.FormulaParser).toBeDefined();
    expect(publicApi.FormulaFormatter).toBeDefined();
    expect(publicApi.FormulaEvaluator).toBeDefined();
    expect(publicApi.DependencyGraph).toBeDefined();
    expect(publicApi.AggregationCache).toBeDefined();
    expect(publicApi.FunctionRegistry).toBeDefined();
    expect(publicApi.SUM).toBeDefined();
    expect(publicApi.COUNT).toBeDefined();

    expect(publicApi.parseCellRef('A1')).toEqual({ row: 0, col: 0, absRow: false, absCol: false });
    expect(publicApi.toCellRef(0, 0)).toBe('A1');

    const key = publicApi.cellKey(2, 3);
    expect(publicApi.fromCellKey(key)).toEqual([2, 3]);
  });
});
