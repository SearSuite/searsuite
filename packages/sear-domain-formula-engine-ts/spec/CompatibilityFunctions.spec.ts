import { FormulaErrorCode } from '@searsuite/sear-domain-formula-engine';
import { evaluateCategoryFormula, expectClose } from './FormulaCategoryTestUtils';

describe('compatibility formulas', () => {
  it('keeps legacy BETAINV endpoint values distinct from BETA.INV', () => {
    expect(evaluateCategoryFormula('=BETAINV(0,8,10,1,3)')).toBe(1);
    expect(evaluateCategoryFormula('=BETAINV(1,8,10,1,3)')).toBe(3);
    expect(evaluateCategoryFormula('=BETA.INV(1,8,10,1,3)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
  });

  it.each([
    ['=NORMSDIST(1.333333)', 0.9087887256040951],
    ['=CONFIDENCE(0.05,2.5,50)', 0.6929519121748386],
    ['=LOGINV(0.039084,3.5,1.2)', 4.000025218680636],
  ])('%s follows the high-precision normal distribution result', (formula, expected) => {
    expect(evaluateCategoryFormula(formula)).toBeCloseTo(expected, 11);
  });

  test.each([
    ['BETADIST', '=BETADIST(2,8,10,1,3)', 0.6854706],
    ['BETAINV', '=BETAINV(0.685470581,8,10,1,3)', 2],
    ['BINOMDIST', '=BINOMDIST(6,10,0.5,FALSE)', 0.205078125],
    ['CHIDIST', '=CHIDIST(18.307,10)', 0.05000058909139826],
    ['CONFIDENCE', '=CONFIDENCE(0.05,2.5,50)', 0.6929519],
    ['EXPONDIST', '=EXPONDIST(0.2,10,TRUE)', 0.8646647],
    ['GAMMADIST', '=GAMMADIST(10,9,2,TRUE)', 0.0680936],
    ['HYPGEOMDIST', '=HYPGEOMDIST(1,4,8,20)', 0.3632611],
    ['NORMDIST', '=NORMDIST(42,40,1.5,TRUE)', 0.9087888],
    ['NORMSDIST', '=NORMSDIST(1.333333)', 0.9087887],
    ['POISSON', '=POISSON(2,5,TRUE)', 0.124652],
    ['WEIBULL', '=WEIBULL(105,20,100,TRUE)', 0.9295814],
  ])('%s preserves its legacy result', (_name, formula, expected) =>
    expectClose(evaluateCategoryFormula(formula), expected),
  );

  it('preserves legacy negative CEILING and FLOOR direction rules', () => {
    expect(evaluateCategoryFormula('=CEILING(-2.5,-2)')).toBe(-4);
    expect(evaluateCategoryFormula('=CEILING(-2.5,2)')).toBe(-2);
    expect(evaluateCategoryFormula('=FLOOR(-2.5,-2)')).toBe(-2);
    expect(evaluateCategoryFormula('=FLOOR(2.5,-2)')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluateCategoryFormula('=FLOOR(2.5,FALSE)')).toEqual({ kind: 'error', code: FormulaErrorCode.DivisionByZero });
    expect(evaluateCategoryFormula('=FLOOR("2024-02-29",1)')).toBe(45351);
  });

  it('rejects impossible legacy hypergeometric outcomes', () => {
    expect(evaluateCategoryFormula('=HYPGEOMDIST(1,0,8,20)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluateCategoryFormula('=HYPGEOMDIST(1,0.5,8,20)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluateCategoryFormula('=HYPGEOMDIST(1,1e-12,8,20)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluateCategoryFormula('=HYPGEOMDIST(1,FALSE,8,20)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluateCategoryFormula('=HYPGEOMDIST("2024-02-29",4,8,20)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluateCategoryFormula('=HYPGEOMDIST(0,FALSE,8,20)')).toBe(1);
    expect(evaluateCategoryFormula('=HYPGEOMDIST(0,0,8,20)')).toBe(1);
    expect(evaluateCategoryFormula('=HYPGEOMDIST(1,A1,8,20)', { '0,0': false }))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluateCategoryFormula('=HYPGEOMDIST(1,IF(TRUE,A1,0),8,20)', { '0,0': false }))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluateCategoryFormula('=HYPGEOMDIST(1,IF(TRUE,A1,0),8,20)', { '0,0': 0.5 }))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluateCategoryFormula('=HYPGEOMDIST(1,4,21,20)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluateCategoryFormula('=HYPGEOM.DIST(1,0,8,20,FALSE)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
  });

  it('rejects formula-produced numeric text before comparing legacy covariance sizes', () => {
    for (const text of ['0', '1', '-1', '1.5', '001']) {
      expect(evaluateCategoryFormula('=COVAR(IF(TRUE,A1,0),{5,11,12})', { '0,0': text }))
        .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    }
    expect(evaluateCategoryFormula('=COVAR(TRUE,{5,11,12})'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluateCategoryFormula('=COVAR(A1,{5,11,12})', { '0,0': true }))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluateCategoryFormula('=COVAR({2,4,8},FALSE)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluateCategoryFormula('=COVAR(1,{5,11,12})'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
    expect(evaluateCategoryFormula('=COVAR({TRUE},{5,11,12})'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
  });

  it('keeps legacy date-text coercion distinct from modern distributions', () => {
    expect(evaluateCategoryFormula('=POISSON(2,A1,TRUE)', { '0,0': '2024-02-29' })).toBe(0);
    expect(evaluateCategoryFormula('=QUARTILE("2024-02-29",1)')).toBe(45351);
  });

  it('maps one- and two-tailed legacy t functions explicitly', () => {
    const one = evaluateCategoryFormula('=TDIST(1.96,60,1)');
    const two = evaluateCategoryFormula('=TDIST(1.96,60,2)');
    expectClose(two, (one as number) * 2);
    expect(evaluateCategoryFormula('=TDIST(1.96,60,3)')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
  });

  it('rejects nonnumeric scalar MODE arguments', () => {
    expect(evaluateCategoryFormula('=MODE(1,1,2,"1")')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluateCategoryFormula('=MODE(TRUE,1,2,3)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluateCategoryFormula('=MODE(1,1,2,3)')).toBe(1);
  });

  it('rejects nonnumeric scalar CHITEST inputs before shape comparison', () => {
    expect(evaluateCategoryFormula('=CHITEST("1",{45,48;24,22})')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluateCategoryFormula('=CHITEST(TRUE,{45,48;24,22})')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluateCategoryFormula('=CHITEST(1,{45,48;24,22})')).toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
  });

  it('supports ranges and workbook-qualified ranges through legacy aliases', () => {
    const values = { 'Sheet2:0,0': 1, 'Sheet2:1,0': 2, 'Sheet2:2,0': 3 };
    expect(evaluateCategoryFormula('=STDEV(Sheet2!A1:A3)', values)).toBe(1);
    expectClose(evaluateCategoryFormula('=VARP(Sheet2!A1:A3)', values), 2 / 3);
  });

  it('propagates errors and validates argument counts', () => {
    expect(evaluateCategoryFormula('=NORMDIST(1/0,0,1,TRUE)')).toEqual({
      kind: 'error',
      code: FormulaErrorCode.DivisionByZero,
    });
    expect(evaluateCategoryFormula('=BETADIST(1)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });
});
