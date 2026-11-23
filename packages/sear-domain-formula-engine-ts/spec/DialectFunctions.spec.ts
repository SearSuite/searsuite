import { evaluateCategoryFormula, expectClose } from './FormulaCategoryTestUtils';

describe('cross-spreadsheet dialect formulas', () => {
  it('handles array shaping and flattening', () => {
    expect(evaluateCategoryFormula('=ARRAY_CONSTRAIN({1,2;3,4},1,2)')).toEqual([[1, 2]]);
    expect(evaluateCategoryFormula('=FLATTEN({1,2},{3;4})')).toEqual([[1], [2], [3], [4]]);
    expect(evaluateCategoryFormula('=ARRAY_CONSTRAIN({1,2},0,1)')).toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('constrains before propagating errors outside the retained range', () => {
    const values = { '104,1': 1, '105,1': { kind: 'error' as const, code: '#N/A' as const }, '106,1': 2 };
    expect(evaluateCategoryFormula('=ARRAY_CONSTRAIN(B105:B107,1,1)', values)).toEqual([[1]]);
    expect(evaluateCategoryFormula('=ARRAY_CONSTRAIN(B105:B107,2,1)', values)).toEqual([
      [1],
      [{ kind: 'error', code: '#N/A' }],
    ]);
  });

  it('converts Unix epochs and date serials', () => {
    expect(evaluateCategoryFormula('=EPOCHTODATE(0)')).toBe(25_569);
    expect(evaluateCategoryFormula('=EPOCHTODATE(0,)')).toBe(25_569);
    expect(evaluateCategoryFormula('=EPOCHTODATE(86400000,2)')).toBe(25_570);
    expect(evaluateCategoryFormula('=TO_DATE(45351.75)')).toBe(45_351);
  });

  it('validates intervals, dates, email addresses, and URLs', () => {
    expect(evaluateCategoryFormula('=ISBETWEEN(1,1,2)')).toBe(true);
    expect(evaluateCategoryFormula('=ISBETWEEN(1,1,2,FALSE)')).toBe(false);
    expect(evaluateCategoryFormula('=ISDATE("2024-02-29")')).toBe(true);
    expect(evaluateCategoryFormula('=ISDATE("not a date")')).toBe(false);
    expect(evaluateCategoryFormula('=ISDATE(10000000)')).toBe(false);
    expect(evaluateCategoryFormula('=ISDATE(2958465)')).toBe(true);
    expect(evaluateCategoryFormula('=ISDATE(DATE(2024,1,1))')).toBe(true);
    expect(evaluateCategoryFormula('=ISDATE("2024-02-30")')).toBe(false);
    expect(evaluateCategoryFormula('=ISDATE("2024-13-01")')).toBe(false);
    expect(evaluateCategoryFormula('=DATEVALUE("2024-02-30")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluateCategoryFormula('=VALUE("2024-02-30")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluateCategoryFormula('=ISEMAIL("a@example.com")')).toBe(true);
    expect(evaluateCategoryFormula('=ISEMAIL("a@localhost")')).toBe(false);
    expect(evaluateCategoryFormula('=ISURL("https://example.com/path")')).toBe(true);
    expect(evaluateCategoryFormula('=ISURL("example.com")')).toBe(false);
  });

  it('rejects invalid email local parts and domain labels', () => {
    for (const address of ['a..b@example.com', 'a.@example.com', 'a,b@example.com', 'a@(example).com', 'a@-example.com']) {
      expect(evaluateCategoryFormula(`=ISEMAIL("${address}")`)).toBe(false);
    }
    for (const address of ['a.b@example.com', 'a+b@example.com', 'a@example.com']) {
      expect(evaluateCategoryFormula(`=ISEMAIL("${address}")`)).toBe(true);
    }
  });

  it('validates URL ports and host labels while accepting single-character hosts', () => {
    for (const address of ['https://example.com:99999', 'https://-example.com', 'https://example..com']) {
      expect(evaluateCategoryFormula(`=ISURL("${address}")`)).toBe(false);
    }
    for (const address of ['https://example.com', 'https://a', 'https://a/', 'https://ab']) {
      expect(evaluateCategoryFormula(`=ISURL("${address}")`)).toBe(true);
    }
  });

  it('supports bank rounding and weighted statistics', () => {
    expect(evaluateCategoryFormula('=ROUNDBANK(2.5,0)')).toBe(2);
    expect(evaluateCategoryFormula('=ROUNDBANK(3.5,0)')).toBe(4);
    expect(evaluateCategoryFormula('=ROUNDBANK(2.5,0.5)')).toBe(2);
    expect(evaluateCategoryFormula('=ROUNDBANK(2.5,1.005)')).toBe(2.5);
    expect(evaluateCategoryFormula('=ROUNDBANK(2.5,-2.675)')).toBe(0);
    expect(evaluateCategoryFormula('=ROUNDBANK(2.5,-45000)')).toBe(0);
    expect(evaluateCategoryFormula('=ROUNDBANK("",0)')).toMatchObject({ kind: 'error', code: '#VALUE!' });
    expect(evaluateCategoryFormula('=AVERAGE_WEIGHTED({10,20},{1,3})')).toBe(17.5);
    expectClose(evaluateCategoryFormula('=MARGINOFERROR(0.95,{1,2,3,4})'), 1.265151, 5);
  });

  it('keeps weighted averages finite when intermediate sums overflow', () => {
    expect(evaluateCategoryFormula('=AVERAGE_WEIGHTED({1E308,1E308},{1,1})')).toBe(1e308);
    expect(evaluateCategoryFormula('=AVERAGE.WEIGHTED({1E308,1E308},{1,1})')).toBe(1e308);
    expect(evaluateCategoryFormula('=AVERAGE_WEIGHTED({1,1},{1E308,1E308})')).toBe(1);
    expect(evaluateCategoryFormula('=AVERAGE_WEIGHTED({1E308,-1E308},{1,1})')).toBe(0);
  });

  it('converts Chinese numbers and provides the REGEXMATCH alias', () => {
    expect(evaluateCategoryFormula('=NUMBERSTRING(123,1)')).toBe('一百二十三');
    expect(evaluateCategoryFormula('=NUMBERSTRING(12,3)')).toBe('一二');
    expect(evaluateCategoryFormula('=NUMBERSTRING(-1e-12,1)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluateCategoryFormula('=REGEXMATCH("A12","[0-9]+")')).toBe(true);
    expect(evaluateCategoryFormula('=REGEXMATCH("ABC","[0-9]+")')).toBe(false);
  });
});
