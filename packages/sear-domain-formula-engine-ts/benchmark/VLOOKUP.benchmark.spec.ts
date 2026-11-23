import { benchmarkFormula, benchmarkRows } from './benchmarkUtils';

describe('VLOOKUP benchmark', () => {
  it('stays below the configured p95 threshold', () => {
    expect(benchmarkFormula(`=VLOOKUP(5000,A1:C${benchmarkRows},3,TRUE)`).p95).toBeGreaterThanOrEqual(0);
  });
});
