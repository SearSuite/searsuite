import { FormulaErrorCode } from '@searsuite/sear-domain-formula-engine';
import { evaluateCategoryFormula } from './FormulaCategoryTestUtils';

describe('logical formulas', () => {
  it('covers scalar logical functions and short-circuit branches', () => {
    expect(evaluateCategoryFormula('=NOT(-1e-12)')).toBe(false);
    expect(evaluateCategoryFormula('=AND(TRUE,1,NOT(FALSE))')).toBe(true);
    expect(evaluateCategoryFormula('=AND(TRUE,"FALSE")')).toBe(false);
    expect(evaluateCategoryFormula('=AND(TRUE,"TRUE")')).toBe(true);
    expect(evaluateCategoryFormula('=AND("foo",TRUE)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluateCategoryFormula('=OR("foo",FALSE)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluateCategoryFormula('=AND("TRUE")')).toBe(true);
    expect(evaluateCategoryFormula('=AND("TRUE",1)')).toBe(true);
    expect(evaluateCategoryFormula('=OR(FALSE,"FALSE")')).toBe(false);
    expect(evaluateCategoryFormula('=XOR(TRUE,"FALSE")')).toBe(true);
    expect(evaluateCategoryFormula('=XOR("TRUE",FALSE)')).toBe(true);
    expect(evaluateCategoryFormula('=AND(A1,TRUE)', { '0,0': 'foo' })).toBe(true);
    expect(evaluateCategoryFormula('=OR(A1,FALSE)', { '0,0': 'foo' })).toBe(false);
    expect(evaluateCategoryFormula('=AND(A1,1)', {}, {
      iterateRangeCells: () => [{ row: 0, col: 0, value: 0, source: 'empty' }],
    })).toBe(true);
    expect(evaluateCategoryFormula('=OR(FALSE,0,TRUE)')).toBe(true);
    expect(evaluateCategoryFormula('=XOR(TRUE,TRUE,TRUE)')).toBe(true);
    expect(evaluateCategoryFormula('=TRUE()')).toBe(true);
    expect(evaluateCategoryFormula('=FALSE()')).toBe(false);
    expect(evaluateCategoryFormula('=NOT("")')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluateCategoryFormula('=NOT("1")')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluateCategoryFormula('=IF("0",42,1/0)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluateCategoryFormula('=NOT("FALSE")')).toBe(true);
    expect(evaluateCategoryFormula('=IFS("",1,TRUE,2)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluateCategoryFormula('=IFNA(NA(),42)')).toBe(42);
    expect(evaluateCategoryFormula('=IFNA(1/0,42)')).toEqual({ kind: 'error', code: FormulaErrorCode.DivisionByZero });
    expect(evaluateCategoryFormula('=IFS(FALSE,1,TRUE,2,1/0,3)')).toBe(2);
    expect(evaluateCategoryFormula('=SWITCH(2,1,10,2,20,30)')).toBe(20);
    expect(evaluateCategoryFormula('=SWITCH(C2,"已完成",1,0)', { '1,2': '已完成' })).toBe(1);
    expect(evaluateCategoryFormula('=SWITCH(C2,C2,1,0)', { '1,2': '已完成' })).toBe(1);
    expect(evaluateCategoryFormula('=SWITCH("已完成","已完成",1,0)')).toBe(1);
  });

  it('BUG-1037 rejects ordinary direct text even when a logical value remains', () => {
    for (const text of ['', '0', '1', '-1', '1.5', 'abc', ' a ', 'a,b', '001', '2024-02-29', '汉字', '😀']) {
      expect(evaluateCategoryFormula(`=AND(TRUE,"${text}")`)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
      expect(evaluateCategoryFormula(`=OR(FALSE,"${text}")`)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
      expect(evaluateCategoryFormula(`=XOR(TRUE,"${text}")`)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    }
    expect(evaluateCategoryFormula('=AND("abc")')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluateCategoryFormula('=NOT("abc")')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });


  it('ignores cell text returned by IF in logical aggregations', () => {
    const values = { '0,0': { kind: 'text' as const, value: 'foo', numericCoercion: 'allow' as const } };
    expect(evaluateCategoryFormula('=AND(IF(TRUE,A1,0),1)', values)).toBe(true);
    expect(evaluateCategoryFormula('=OR(IF(TRUE,A1,0),FALSE)', values)).toBe(false);
    expect(evaluateCategoryFormula('=XOR(IF(TRUE,A1,0),TRUE)', values)).toBe(true);
    expect(evaluateCategoryFormula('=AND(IF(TRUE,"foo",0),1)', values)).toBe(true);
  });

  it('replaces only errored elements of an IFERROR range', () => {
    const error = { kind: 'error' as const, code: FormulaErrorCode.DivisionByZero };
    const values = { '189,3': 1, '190,3': error };
    expect(evaluateCategoryFormula('=IFERROR(D190:D191,{2;3})', values)).toEqual([[1], [3]]);
    expect(evaluateCategoryFormula('=IFERROR(D190:D191,9)', values)).toEqual([[1], [9]]);
    expect(evaluateCategoryFormula('=IFERROR(D190,1/0)', values)).toBe(1);
  });

  it('replaces only #N/A elements of an IFNA range', () => {
    const notAvailable = { kind: 'error' as const, code: FormulaErrorCode.NotAvailable };
    const divisionByZero = { kind: 'error' as const, code: FormulaErrorCode.DivisionByZero };
    const values = { '191,3': 1, '192,3': notAvailable, '193,3': divisionByZero };
    expect(evaluateCategoryFormula('=IFNA(D192:D193,{2;3})', values)).toEqual([[1], [3]]);
    expect(evaluateCategoryFormula('=IFNA(D192:D194,9)', values)).toEqual([[1], [9], [divisionByZero]]);
    expect(evaluateCategoryFormula('=IFNA(D192,1/0)', values)).toBe(1);
  });

  it('selects IF, IFS, and SWITCH branches for each array element', () => {
    expect(evaluateCategoryFormula('=IF({TRUE,FALSE},{1,2},{3,4})')).toEqual([[1, 4]]);
    expect(evaluateCategoryFormula('=IF({TRUE,FALSE},1,0)')).toEqual([[1, 0]]);
    expect(evaluateCategoryFormula('=IFS({TRUE,FALSE},1,{FALSE,TRUE},2)')).toEqual([[1, 2]]);
    expect(evaluateCategoryFormula('=SWITCH({1,2},1,"a",2,"b")')).toEqual([['a', 'b']]);
    expect(evaluateCategoryFormula('=IF({TRUE,FALSE},1,1/0)')).toEqual([
      [1, { kind: 'error', code: FormulaErrorCode.DivisionByZero }],
    ]);
    expect(evaluateCategoryFormula('=SWITCH({1,3},1,"a",2,"b")')).toEqual([
      ['a', { kind: 'error', code: FormulaErrorCode.NotAvailable }],
    ]);
  });

  it('keeps LET bindings while returning #NAME? for removed custom functions', () => {
    expect(evaluateCategoryFormula('=LET(rate,3,amount,4,rate*amount)')).toBe(12);
    for (const name of ['c', 'C', 'r', 'R']) {
      expect(evaluateCategoryFormula(`=LET(${name},1,${name})`)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    }
    expect(evaluateCategoryFormula('=LET(x,1,x)')).toBe(1);
    expect(evaluateCategoryFormula('=LET(A1,1,A1)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    for (const name of ['LAMBDA', 'BYROW', 'BYCOL', 'MAKEARRAY', 'MAP', 'REDUCE', 'SCAN', 'ISOMITTED']) {
      expect(evaluateCategoryFormula(`=${name}(1)`)).toEqual({ kind: 'error', code: FormulaErrorCode.Name });
    }
    expect(evaluateCategoryFormula('=LAMBDA(x,x+1)(3)')).toEqual({ kind: 'error', code: FormulaErrorCode.Name });
  });

  it('limits LET to 126 bindings', () => {
    const formula = (count: number) =>
      `=LET(${Array.from({ length: count }, (_, index) => `x_${index + 1},${index + 1}`).join(',')},x_${count})`;
    expect(evaluateCategoryFormula(formula(126))).toBe(126);
    expect(evaluateCategoryFormula(formula(127))).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });
});
