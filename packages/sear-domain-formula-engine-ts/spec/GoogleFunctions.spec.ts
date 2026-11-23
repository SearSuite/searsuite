import {
  type EvalContext,
  FormulaErrorCode,
  FormulaGoogleServiceDefinition,
  FormulaServiceCacheStatus,
  type FormulaExternalServiceReader,
  type FormulaGoogleRequest,
  type FormulaGoogleService,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { FormulaGoogleServiceCache } from '../src/FormulaGoogleServiceCache';
import { evaluateCategoryFormula } from './FormulaCategoryTestUtils';

describe('Google-compatible formulas', () => {
  it('sorts numeric-looking text lexically in SORTN', () => {
    expect(evaluateCategoryFormula('=SORTN({"2";"10"},1,0,1,TRUE)')).toEqual([['10']]);
    expect(evaluateCategoryFormula('=SORTN({2;10},1,0,1,TRUE)')).toEqual([[2]]);
  });

  it('rejects a zero SORTN row limit in every display mode', () => {
    for (let mode = 0; mode < 4; mode++) {
      expect(evaluateCategoryFormula(`=SORTN({2;1},0,${mode})`)).toEqual({
        kind: 'error', code: FormulaErrorCode.Value,
      });
    }
    expect(evaluateCategoryFormula('=SORTN({2;1},1,1)')).toEqual([[1]]);
  });


  it('supports operator functions and validates arithmetic errors', () => {
    expect(evaluateCategoryFormula('=ADD(2,3)')).toBe(5);
    expect(evaluateCategoryFormula('=DIVIDE(6,2)')).toBe(3);
    expect(evaluateCategoryFormula('=DIVIDE(1,0)')).toEqual({ kind: 'error', code: FormulaErrorCode.DivisionByZero });
    expect(evaluateCategoryFormula('=EQ("a","a")')).toBe(true);
    expect(evaluateCategoryFormula('=GT(3,2)')).toBe(true);
    expect(evaluateCategoryFormula('=GTE(2,2)')).toBe(true);
    expect(evaluateCategoryFormula('=LT(2,3)')).toBe(true);
    expect(evaluateCategoryFormula('=LTE(2,2)')).toBe(true);
    expect(evaluateCategoryFormula('=MINUS(5,2)')).toBe(3);
    expect(evaluateCategoryFormula('=MULTIPLY(3,4)')).toBe(12);
    expect(evaluateCategoryFormula('=NE(2,3)')).toBe(true);
    expect(evaluateCategoryFormula('=POW(2,3)')).toBe(8);
    expect(evaluateCategoryFormula('=POW(0,-1)')).toEqual({
      kind: 'error',
      code: FormulaErrorCode.DivisionByZero,
    });
    expect(evaluateCategoryFormula('=UMINUS(3)')).toBe(-3);
    expect(evaluateCategoryFormula('=UNARY_PERCENT(25)')).toBe(0.25);
    expect(evaluateCategoryFormula('=UPLUS("3")')).toBe(3);
  });

  it('supports conversion, text, distinct count, and the dotted weighted-average alias', () => {
    expect(evaluateCategoryFormula('=TO_DOLLARS(12.5)')).toBe(12.5);
    expect(evaluateCategoryFormula('=TO_PERCENT(0.25)')).toBe(0.25);
    expect(evaluateCategoryFormula('=TO_PURE_NUMBER("42")')).toBe(42);
    expect(evaluateCategoryFormula('=TO_TEXT(42)')).toBe('42');
    expect(evaluateCategoryFormula('=JOIN("-",{1,2,3})')).toBe('1-2-3');
    expect(evaluateCategoryFormula('=SPLIT("a,b,,c",",",TRUE,FALSE)')).toEqual([['a', 'b', '', 'c']]);
    expect(evaluateCategoryFormula('=SPLIT("a-b","1e-12")')).toEqual([['a', 'b']]);
    expect(evaluateCategoryFormula('=COUNTUNIQUE(1,1,2,{2,3})')).toBe(3);
    expect(evaluateCategoryFormula('=COUNTUNIQUE("a","A")')).toBe(1);
    expect(evaluateCategoryFormula('=COUNTUNIQUE({"a";"A";"b"})')).toBe(2);
    expect(evaluateCategoryFormula('=COUNTUNIQUE("1",1)')).toBe(2);
    expect(evaluateCategoryFormula('=COUNTUNIQUE(A1:A2)', {
      '0,0': { kind: 'text', value: 'a', numericCoercion: 'allow' },
      '1,0': { kind: 'text', value: 'A', numericCoercion: 'allow' },
    })).toBe(1);
    expect(evaluateCategoryFormula('=AVERAGE.WEIGHTED({10,20},{1,3})')).toBe(17.5);
  });

  it('TO_TEXT preserves the number format of a referenced cell', () => {
    const metadata = {
      readCell: jest.fn(() => ({
        reference: { row: 11, col: 0 }, source: 'value' as const, value: 42, numberFormat: '0%',
      })),
    };
    expect(evaluateCategoryFormula('=TO_TEXT(A12)', { '11,0': 42 }, { metadata })).toBe('4200%');
    expect(metadata.readCell).toHaveBeenCalledWith({ row: 11, col: 0 });
    expect(evaluateCategoryFormula('=TO_TEXT(42)')).toBe('42');
  });

  it('JOIN keeps empty array slots without rendering null', () => {
    expect(evaluateCategoryFormula('=JOIN("-",{1,"",2})')).toBe('1--2');
  });

  it('JOIN treats a blank cell delimiter as empty while retaining numeric zero', () => {
    const overrides: Partial<EvalContext> = {
      *iterateRangeCells(row, col) {
        const source = row === 143 ? 'empty' : 'value';
        yield { row, col, value: 0, source };
      },
    };
    expect(evaluateCategoryFormula('=JOIN(A144,{1,2})', {}, overrides)).toBe('12');
    expect(evaluateCategoryFormula('=JOIN(A145,{1,2})', {}, overrides)).toBe('102');
  });

  it('JOIN accepts an omitted delimiter', () => {
    expect(evaluateCategoryFormula('=JOIN(,{1,2})')).toBe('12');
  });

  it('JOIN propagates errors inside an array', () => {
    expect(evaluateCategoryFormula('=JOIN("-",{1,1/0,2})')).toEqual({
      kind: 'error', code: FormulaErrorCode.DivisionByZero,
    });
  });

  it('COUNTUNIQUE ignores empty text and blank references', () => {
    const values = { '25,0': 1, '26,0': 0 };
    const overrides: Partial<EvalContext> = {
      *iterateRangeCells(startRow, startCol, endRow, endCol) {
        for (let row = startRow; row <= endRow; row++) {
          for (let col = startCol; col <= endCol; col++) {
            const source = row === 24 ? 'empty' : 'value';
            yield { row, col, value: values[`${row},${col}` as keyof typeof values] ?? 0, source };
          }
        }
      },
    };
    expect(evaluateCategoryFormula('=COUNTUNIQUE(1,"")')).toBe(1);
    expect(evaluateCategoryFormula('=COUNTUNIQUE(1,2.64,37,"Number","")')).toBe(4);
    expect(evaluateCategoryFormula('=COUNTUNIQUE(A25,1)', values, overrides)).toBe(1);
    expect(evaluateCategoryFormula('=COUNTUNIQUE(A25:A26)', values, overrides)).toBe(1);
    expect(evaluateCategoryFormula('=COUNTUNIQUE(A27,1)', values, overrides)).toBe(2);
  });

  it('AVERAGE.WEIGHTED requires matching row and column counts', () => {
    const values = { '26,0': 1, '26,1': 2, '27,0': 3, '27,1': 4,
      '26,3': 1, '26,4': 1, '26,5': 1, '26,6': 1 };
    expect(evaluateCategoryFormula('=AVERAGE.WEIGHTED(A27:B28,D27:G27)', values)).toEqual({
      kind: 'error', code: FormulaErrorCode.Value,
    });
  });

  it('AVERAGE.WEIGHTED accepts multiple value and weight pairs', () => {
    expect(evaluateCategoryFormula('=AVERAGE.WEIGHTED(10,1,20,3)')).toBe(17.5);
    expect(evaluateCategoryFormula('=AVERAGE.WEIGHTED({10,20},{1,3})')).toBe(17.5);
  });

  it('Google comparison functions ignore text case like comparison operators', () => {
    expect(evaluateCategoryFormula('=GT("a","A")')).toBe(false);
    expect(evaluateCategoryFormula('=EQ("a","A")')).toBe(true);
    expect(evaluateCategoryFormula('=NE("a","A")')).toBe(false);
  });

  it('SORTN sorts all columns by default and applies additional sort keys', () => {
    expect(evaluateCategoryFormula('=SORTN({1,2;1,1},1)')).toEqual([[1, 1]]);
    expect(evaluateCategoryFormula('=SORTN({"A",2;"A",1;"B",0},1,0,1,TRUE,2,TRUE)')).toEqual([['A', 1]]);
  });

  it('SORTN tie modes use unique sort keys', () => {
    expect(evaluateCategoryFormula('=SORTN({1;1;2;2},2,3,1,TRUE)')).toEqual([[1], [1], [2], [2]]);
    expect(evaluateCategoryFormula('=SORTN({1,20;1,10;1,20},3,2,1,TRUE)')).toEqual([[1, 20]]);
  });

  it('SORTN mode 1 includes only rows fully equal to the cutoff row', () => {
    expect(evaluateCategoryFormula('=SORTN({1,10;1,20;2,30},1,1,1,TRUE)')).toEqual([[1, 10]]);
    expect(evaluateCategoryFormula('=SORTN({1,10;1,10;2,30},1,1,1,TRUE)')).toEqual([[1, 10], [1, 10]]);
  });

  it('SORTN rejects zero rows and invalid sort columns', () => {
    const error = { kind: 'error', code: FormulaErrorCode.Value };
    expect(evaluateCategoryFormula('=SORTN({1;2},0)')).toEqual(error);
    expect(evaluateCategoryFormula('=SORTN({2;1},1,0,0,TRUE)')).toEqual(error);
    expect(evaluateCategoryFormula('=SORTN({2;1},1,0,3,TRUE)')).toEqual(error);
  });

  it('SORTN accepts a matching external sort range', () => {
    const values = { '73,0': 2, '73,1': 100, '74,0': 1, '74,1': 200, '73,2': 9, '74,2': 8 };
    expect(evaluateCategoryFormula('=SORTN(A74:B75,1,0,C74:C75,TRUE)', values)).toEqual([[1, 200]]);
  });

  it('QUERY infers headers and rejects invalid statements or column references', () => {
    const error = { kind: 'error', code: FormulaErrorCode.Value };
    expect(evaluateCategoryFormula('=ROWS(QUERY({"Value";1;2},"select Col1 limit 1",-1))')).toBe(2);
    expect(evaluateCategoryFormula('=QUERY({1;2},"nonsense",0)')).toEqual(error);
    expect(evaluateCategoryFormula('=QUERY({1;2},"select Col1 where junk",0)')).toEqual(error);
    expect(evaluateCategoryFormula('=QUERY({1;2},"select Col3",0)')).toEqual(error);
    expect(evaluateCategoryFormula('=QUERY({1,2},"select Col2 order by Col99",0)')).toEqual(error);
    expect(evaluateCategoryFormula('=QUERY({1,2},"select Col2 where Col99 = 3",0)')).toEqual(error);
  });

  it('QUERY applies complete conditions, substring matching, and all order keys', () => {
    expect(evaluateCategoryFormula('=ROWS(QUERY({1,2;2,1;3,0},"select Col1 where Col1 > 1 and Col2 < 1",0))')).toBe(1);
    expect(evaluateCategoryFormula('=ROWS(QUERY({1,2;2,1;3,0},"select Col1 where Col1 = 1 or Col2 = 1",0))')).toBe(2);
    expect(evaluateCategoryFormula('=INDEX(QUERY({1,2;1,1},"select Col2 order by Col1 asc, Col2 asc",0),1,1)')).toBe(1);
    expect(evaluateCategoryFormula('=ROWS(QUERY({"abc";"def"},"select Col1 where Col1 contains \'a\'",0))')).toBe(1);
  });

  it('QUERY compares text by exact text and does not treat blank as numeric zero', () => {
    expect(evaluateCategoryFormula('=ROWS(QUERY({"a";"A"},"select Col1 where Col1 = \'a\'",0))')).toBe(1);
    expect(evaluateCategoryFormula('=ROWS(QUERY({"01";"1"},"select Col1 where Col1 = \'01\'",0))')).toBe(1);
    expect(evaluateCategoryFormula('=INDEX(QUERY({"2";"10"},"select Col1 order by Col1 asc",0),1,1)')).toBe('10');
    const values = { '144,0': 0, '145,0': 1 };
    const overrides: Partial<EvalContext> = {
      *iterateRangeCells(startRow, startCol, endRow) {
        for (let row = startRow; row <= endRow; row++) {
          yield { row, col: startCol, value: values[`${row},0` as keyof typeof values] ?? 0,
            source: row === 143 ? 'empty' : 'value' };
        }
      },
    };
    expect(evaluateCategoryFormula('=ROWS(QUERY(A144:A146,"select Col1 where Col1 = 0",0))', values, overrides)).toBe(1);
  });

  it('QUERY ignores errors outside selected rows and columns', () => {
    const values = {
      '147,0': 1, '147,1': { kind: 'error' as const, code: FormulaErrorCode.DivisionByZero },
      '148,0': 2, '148,1': 3,
    };
    expect(evaluateCategoryFormula('=INDEX(QUERY(A148:B149,"select Col1",0),1,1)', values)).toBe(1);
    expect(evaluateCategoryFormula('=INDEX(QUERY(A148:B149,"select Col2 where Col1 > 1",0),1,1)', values)).toBe(3);
  });

  it('QUERY keeps keywords and escaped quotes inside string literals', () => {
    expect(evaluateCategoryFormula('=QUERY({"X LIMIT 1",3;"X LIMIT 1",1;"X LIMIT 1",2},"select Col2 where Col1 = \'X LIMIT 1\'",0)'))
      .toEqual([[3], [1], [2]]);
    expect(evaluateCategoryFormula(String.raw`=QUERY({"O'Brien";"Other"},"select Col1 where Col1 = 'O\'Brien'",0)`))
      .toEqual([["O'Brien"]]);
  });

  it('QUERY returns #N/A for a valid query with no matching rows', () => {
    expect(evaluateCategoryFormula('=QUERY({"a";"b"},"select Col1 where Col1 = \'z\'",0)')).toEqual({
      kind: 'error', code: FormulaErrorCode.NotAvailable,
    });
  });

  it('supports array passthrough, sorting, querying, and sparkline projection', () => {
    expect(evaluateCategoryFormula('=ARRAYFORMULA({1,2}*2)')).toEqual([[2, 4]]);
    expect(evaluateCategoryFormula('=SORTN({3;1;2},2)')).toEqual([[1], [2]]);
    expect(
      evaluateCategoryFormula('=QUERY({"A",1;"B",2;"C",3},"select Col1 where Col2 > 1 order by Col2 desc limit 1",0)'),
    ).toEqual([['C']]);
    expect(evaluateCategoryFormula('=SPARKLINE({1,3,2})')).toHaveLength(3);
  });

  it('returns #N/A until host-backed formulas have cached results', () => {
    for (const formula of serviceFormulas) {
      expect(evaluateCategoryFormula(formula)).toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
    }
  });

  it('reads all host-backed formulas synchronously from one neutral service', () => {
    const service: FormulaGoogleService = {
      read(request) {
        return { status: FormulaServiceCacheStatus.Ready, value: resultFor(request) };
      },
    };
    const externalServices: FormulaExternalServiceReader = {
      get<T>(definition: { id: string }): T | undefined {
        return definition.id === FormulaGoogleServiceDefinition.id ? (service as T) : undefined;
      },
    };
    for (const formula of serviceFormulas) {
      expect(evaluateCategoryFormula(formula, {}, { externalServices })).not.toEqual(
        expect.objectContaining({ kind: 'error' }),
      );
    }
  });

  it('deduplicates cache loads and publishes invalidation after completion', async () => {
    const loader = jest.fn(async (request: FormulaGoogleRequest): Promise<FormulaValue> => resultFor(request));
    const cache = new FormulaGoogleServiceCache(loader);
    const request = { functionName: 'IMPORTDATA', arguments: ['https://example.com/data.csv'] } as const;
    const invalidated = jest.fn();
    cache.subscribeInvalidation(invalidated);
    await Promise.all([cache.load(request), cache.load(request)]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(cache.read(request)).toEqual({ status: FormulaServiceCacheStatus.Ready, value: [['cached']] });
    expect(invalidated).toHaveBeenCalledTimes(1);
    cache.destroy();
  });
});

const serviceFormulas = [
  '=AI("Summarize","text")',
  '=GOOGLEFINANCE("NASDAQ:GOOG","price")',
  '=GOOGLETRANSLATE("hello","en","zh-CN")',
  '=IMPORTDATA("https://example.com/data.csv")',
  '=IMPORTFEED("https://example.com/feed.xml")',
  '=IMPORTHTML("https://example.com","table",1)',
  '=IMPORTRANGE("sheet-id","A1:B2")',
  '=IMPORTXML("https://example.com","//title")',
] as const;

function resultFor(request: FormulaGoogleRequest): FormulaValue {
  return request.functionName.startsWith('IMPORT') || request.functionName === 'GOOGLEFINANCE'
    ? [['cached']]
    : 'cached';
}
