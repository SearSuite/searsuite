import { FormulaErrorCode } from '@searsuite/sear-domain-formula-engine';
import { evaluateCategoryFormula, expectClose } from './FormulaCategoryTestUtils';

const database = '{"Tree","Height","Age","Yield";"Apple",18,20,14;"Pear",12,12,10;"Cherry",13,14,9;"Apple",14,15,10}';
const criteria = '{"Tree","Height";"Apple",">15";"Pear","<13"}';

describe('database formulas', () => {
  it('applies AND within criteria rows and OR between rows', () => {
    expect(evaluateCategoryFormula(`=DSUM(${database},"Yield",${criteria})`)).toBe(24);
    expect(evaluateCategoryFormula(`=DCOUNT(${database},"Yield",${criteria})`)).toBe(2);
    expect(evaluateCategoryFormula(`=DCOUNTA(${database},"Tree",${criteria})`)).toBe(2);
    expect(evaluateCategoryFormula(`=DAVERAGE(${database},"Yield",${criteria})`)).toBe(12);
    expect(evaluateCategoryFormula(`=DMAX(${database},"Yield",${criteria})`)).toBe(14);
    expect(evaluateCategoryFormula(`=DMIN(${database},"Yield",${criteria})`)).toBe(10);
    expect(evaluateCategoryFormula(`=DPRODUCT(${database},"Yield",${criteria})`)).toBe(140);
  });

  it('supports field indexes, wildcards, and comparison criteria', () => {
    expect(evaluateCategoryFormula(`=DSUM(${database},4,{"Tree";"App*"})`)).toBe(24);
    expect(evaluateCategoryFormula(`=DSUM(${database},4,{"Age";">=15"})`)).toBe(24);
  });

  it('implements single-record and variance semantics', () => {
    expect(evaluateCategoryFormula(`=DGET(${database},"Yield",{"Tree";"Cherry"})`)).toBe(9);
    expect(evaluateCategoryFormula(`=DGET(${database},"Yield",{"Tree";"Apple"})`)).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expectClose(evaluateCategoryFormula(`=DVAR(${database},"Yield",${criteria})`), 8);
    expectClose(evaluateCategoryFormula(`=DVARP(${database},"Yield",${criteria})`), 4);
    expectClose(evaluateCategoryFormula(`=DSTDEV(${database},"Yield",${criteria})`), Math.sqrt(8));
    expectClose(evaluateCategoryFormula(`=DSTDEVP(${database},"Yield",${criteria})`), 2);
  });

  it('keeps database variance and deviation at zero for identical large values', () => {
    const largeDatabase = '{"K","V";1,1E308;2,1E308}';
    const matching = '{"K";">0"}';
    for (const name of ['DVAR', 'DVARP', 'DSTDEV', 'DSTDEVP']) {
      expect(evaluateCategoryFormula(`=${name}(${largeDatabase},"V",${matching})`)).toBe(0);
    }
    expect(evaluateCategoryFormula(`=DMAX(${largeDatabase},"V",${matching})`)).toBe(1e308);
    const varying = '{"K","V";1,1E150;2,2E150}';
    expect((evaluateCategoryFormula(`=DVAR(${varying},"V",${matching})`) as number) / 5e299).toBeCloseTo(1, 12);
  });

  it('counts selected database errors without treating them as numeric values', () => {
    const cells = {
      '0,0': 'K', '0,1': 'V', '1,0': 1, '1,1': { kind: 'error' as const, code: FormulaErrorCode.DivisionByZero },
      '2,0': 2, '2,1': 5, '0,3': 'K', '1,3': '>0',
    };
    expect(evaluateCategoryFormula('=DCOUNTA(A1:B3,"V",D1:D2)', cells)).toBe(2);
    expect(evaluateCategoryFormula('=DCOUNT(A1:B3,"V",D1:D2)', cells)).toBe(1);
    expect(evaluateCategoryFormula('=DSUM(A1:B3,"V",D1:D2)', cells)).toEqual({
      kind: 'error', code: FormulaErrorCode.DivisionByZero,
    });
  });

  it('counts formula cells whose result is empty text but skips empty cells', () => {
    const values = {
      '0,0': 'K', '0,1': 'V', '1,0': 1, '1,1': '',
      '2,0': 2, '2,1': 5, '0,3': 'K', '1,3': '>0',
    };
    const contextFor = (emptyTextSource: 'formula' | 'empty') => ({
      *iterateRangeCells(startRow: number, startCol: number, endRow: number, endCol: number) {
        for (let row = startRow; row <= endRow; row++) {
          for (let col = startCol; col <= endCol; col++) {
            yield {
              row, col, value: values[`${row},${col}` as keyof typeof values] ?? '',
              source: row === 1 && col === 1 ? emptyTextSource : 'value' as const,
            };
          }
        }
      },
    });
    expect(evaluateCategoryFormula('=DCOUNTA(A1:B3,"V",D1:D2)', values, contextFor('formula'))).toBe(2);
    expect(evaluateCategoryFormula('=DCOUNTA(A1:B3,"V",D1:D2)', values, contextFor('empty'))).toBe(1);
    expect(evaluateCategoryFormula('=DCOUNT(A1:B3,"V",D1:D2)', values, contextFor('formula'))).toBe(1);
  });

  it('treats unknown text criteria fields as unmatched and returns division errors for empty variance samples', () => {
    const unknown = '{"Tree","Other";"Apple","<16"}';
    expect(evaluateCategoryFormula(`=DCOUNTA(${database},"Yield",${unknown})`)).toBe(0);
    const unmatched = '{"Tree";"Missing"}';
    expect(evaluateCategoryFormula(`=DVAR(${database},"Yield",${unmatched})`)).toEqual({
      kind: 'error', code: FormulaErrorCode.DivisionByZero,
    });
    expect(evaluateCategoryFormula(`=DVARP(${database},"Yield",${unmatched})`)).toEqual({
      kind: 'error', code: FormulaErrorCode.DivisionByZero,
    });
  });

  it('propagates errors from database field and criteria arguments', () => {
    const sample = '{"Name","Value";"X",10;"Y",20}';
    expect(evaluateCategoryFormula(`=DSUM(${sample},1/0,{"Name";"X"})`)).toEqual({
      kind: 'error', code: FormulaErrorCode.DivisionByZero,
    });
    for (const name of ['DSUM', 'DCOUNT', 'DGET']) {
      expect(evaluateCategoryFormula(`=${name}(${sample},"Value",{"Name";1/0})`)).toEqual({
        kind: 'error', code: FormulaErrorCode.DivisionByZero,
      });
    }
  });

  it('returns zero for empty database product and extrema', () => {
    const sample = '{"Name","Value";"X",2;"Y",3}';
    const unmatched = '{"Name";"Z"}';
    for (const name of ['DPRODUCT', 'DMAX', 'DMIN']) {
      expect(evaluateCategoryFormula(`=${name}(${sample},2,${unmatched})`)).toBe(0);
    }
    expect(evaluateCategoryFormula(`=DPRODUCT(${sample},2,{"Name";"X"})`)).toBe(2);
  });

  it('BUG-1022 treats unknown database text condition headers as unmatched', () => {
    const sample = '{"Name","Value";"X",2;"Y",3}';
    for (const name of ['DSUM', 'DCOUNT', 'DCOUNTA']) {
      expect(evaluateCategoryFormula(`=${name}(${sample},2,{"Typo";"Y"})`)).toBe(0);
      expect(evaluateCategoryFormula(`=${name}(${sample},2,{"Name";"Y"})`)).toBe(name === 'DSUM' ? 3 : 1);
    }
  });

  it('supports workbook ranges and rejects unknown fields', () => {
    const values = {
      'Data:0,0': 'Tree', 'Data:0,1': 'Yield', 'Data:1,0': 'Apple', 'Data:1,1': 14,
      'Data:2,0': 'Pear', 'Data:2,1': 10, '0,3': 'Tree', '1,3': 'Apple',
    };
    expect(evaluateCategoryFormula('=DSUM(Data!A1:B3,"Yield",D1:D2)', values)).toBe(14);
    expect(evaluateCategoryFormula(`=DSUM(${database},"Missing",${criteria})`)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('validates a selected database reference before reading its cells', () => {
    const cells = { '0,0': { kind: 'error' as const, code: FormulaErrorCode.NotAvailable } };
    expect(evaluateCategoryFormula('=DSUM(IF(TRUE,A1,0),"Yield",{"Tree";"Apple"})', cells)).toEqual({
      kind: 'error', code: FormulaErrorCode.Value,
    });
  });
});
