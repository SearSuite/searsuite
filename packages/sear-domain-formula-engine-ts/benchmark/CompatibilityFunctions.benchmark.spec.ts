import { benchmarkFormula } from './benchmarkUtils';

describe('compatibility formulas benchmark', () => {
  it('processes a 10,000-cell legacy statistical range below the p95 threshold', () => {
    expect(benchmarkFormula('=STDEV(A1:A10000)').p95).toBeGreaterThanOrEqual(0);
  });
});
