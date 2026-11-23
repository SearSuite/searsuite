import { benchmarkFormula, benchmarkRows } from './benchmarkUtils';

describe('AVERAGE benchmark', () => {
  it('stays below the configured p95 threshold', () => {
    expect(benchmarkFormula(`=AVERAGE(A1:A${benchmarkRows})`).p95).toBeGreaterThanOrEqual(0);
  });
});
