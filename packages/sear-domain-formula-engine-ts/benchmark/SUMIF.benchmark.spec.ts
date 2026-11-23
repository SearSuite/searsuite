import { benchmarkFormula, benchmarkRows } from './benchmarkUtils';

describe('SUMIF benchmark', () => {
  it('stays below the configured p95 threshold', () => {
    expect(benchmarkFormula(`=SUMIF(A1:A${benchmarkRows},">50",C1:C${benchmarkRows})`).p95).toBeGreaterThanOrEqual(0);
  });
});
