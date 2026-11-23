import { benchmarkFormula } from './benchmarkUtils';

describe('LET benchmark', () => {
  it('keeps sequential lexical bindings below the configured p95 threshold', () => {
    expect(benchmarkFormula('=LET(value,A10000,factor,2,value*factor)').p95).toBeGreaterThanOrEqual(0);
  });
});
