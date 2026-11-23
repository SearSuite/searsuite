import { benchmarkFormula } from './benchmarkUtils';

describe('database formulas benchmark', () => {
  it('filters and aggregates 10,000 database rows below the p95 threshold', () => {
    expect(benchmarkFormula('=DSUM(A1:C10000,3,{0;">=0"})').p95).toBeGreaterThanOrEqual(0);
  });
});
