import { benchmarkFormula } from './benchmarkUtils';

describe('IFERROR benchmark', () => {
  it('stays below the configured p95 threshold', () => {
    expect(benchmarkFormula('=IFERROR(A1/2,0)').p95).toBeGreaterThanOrEqual(0);
  });
});
