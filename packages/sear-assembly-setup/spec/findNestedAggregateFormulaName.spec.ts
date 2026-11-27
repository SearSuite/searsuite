import { FormulaParser } from '@searsuite/sear-domain-formula-engine-ts';
import { findNestedAggregateFormulaName } from '@searsuite/sear-assembly-sheet-kernel';

describe('findNestedAggregateFormulaName', () => {
  const parser = new FormulaParser();

  it('finds aggregate calls inside expressions', () => {
    expect(findNestedAggregateFormulaName('=SUBTOTAL(9,A1)', parser)).toBe('SUBTOTAL');
    expect(findNestedAggregateFormulaName('=1+SUBTOTAL(9,A1)', parser)).toBe('SUBTOTAL');
    expect(findNestedAggregateFormulaName('=IF(TRUE,AGGREGATE(9,0,A1:A3),0)', parser)).toBe('AGGREGATE');
  });

  it('does not match quoted text or unrelated formulas', () => {
    expect(findNestedAggregateFormulaName('="SUBTOTAL(9,A1)"', parser)).toBeUndefined();
    expect(findNestedAggregateFormulaName('=SUM(A1:A3)', parser)).toBeUndefined();
  });
});
