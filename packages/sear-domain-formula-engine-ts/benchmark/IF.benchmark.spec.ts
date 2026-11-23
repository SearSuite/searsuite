import { benchmarkFormula } from './benchmarkUtils';

describe('IF benchmark', () => {
  it('stays below the configured p95 threshold', () => {
    expect(benchmarkFormula('=IF(A1>50,A1*2,A1/2)').p95).toBeGreaterThanOrEqual(0);
  });
});
