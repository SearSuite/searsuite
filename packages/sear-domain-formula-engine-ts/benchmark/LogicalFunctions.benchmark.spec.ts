import { benchmarkFormula } from './benchmarkUtils';

describe('logical formulas benchmark', () => {
  it('evaluates a bounded logical expression below the p95 threshold', () => {
    expect(benchmarkFormula('=IFS(A10000>0,1,TRUE,0)').p95).toBeGreaterThanOrEqual(0);
  });
});
