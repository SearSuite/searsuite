import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import {
  FunctionRegistry,
  addInFunctions,
  compatibilityFunctions,
  databaseFunctions,
  financialFunctions,
  googleFunctions,
  informationFunctions,
  logicalFunctions,
  textFunctions,
  webFunctions,
} from '../src/functions';
import { lookupFunctionNames } from '../src/functions/lookup/lookupFunctionNames';
import { AVERAGE, COUNT, IF, IFERROR, SUM, SUMIF, VLOOKUP } from '../src';
import { type EvalContext, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { mathFunctions } from '../src/functions/math';

function context(data: Record<string, FormulaValue>, shape: [number, number] = [20, 20]): EvalContext {
  return {
    isCellInBounds: (row, col) => row >= 0 && row < shape[0] && col >= 0 && col < shape[1],
    getSheetShape: () => shape,
    getCellValue: (row, col) => data[`${row},${col}`] ?? 0,
    getWorkbookCellValue: (sheetName, row, col) => data[`${sheetName}:${row},${col}`] ?? 0,
    *iterateRange(sr, sc, er, ec) {
      for (let row = sr; row <= er; row++) for (let col = sc; col <= ec; col++) yield data[`${row},${col}`] ?? 0;
    },
    *iterateRangeCells(sr, sc, er, ec) {
      for (let row = sr; row <= er; row++) {
        for (let col = sc; col <= ec; col++) {
          const key = `${row},${col}`;
          yield {
            row,
            col,
            value: data[key] ?? 0,
            source: Object.prototype.hasOwnProperty.call(data, key) ? ('value' as const) : ('empty' as const),
          };
        }
      }
    },
    *iterateWorkbookRange(sheetName, sr, sc, er, ec) {
      for (let row = sr; row <= er; row++) {
        for (let col = sc; col <= ec; col++) yield data[`${sheetName}:${row},${col}`] ?? 0;
      }
    },
  };
}

function evaluate(formula: string, data: Record<string, FormulaValue> = {}, shape?: [number, number]): FormulaValue {
  const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
  return evaluator.evaluate(new FormulaParser().parse(formula), context(data, shape));
}

describe('built-in FormulaFunction inheritance contract', () => {
  const functions = [SUM, COUNT, AVERAGE, IF, IFERROR, SUMIF, VLOOKUP];

  it.each(functions)('%s exposes a stable function definition', (fn) => {
    expect(fn.name).toMatch(/^[A-Z][A-Z0-9_]*$/);
    expect(typeof fn.evaluate).toBe('function');
    const registered = new FunctionRegistry().get(fn.name);
    expect(registered).toEqual(fn);
    expect(registered).not.toBe(fn);
    expect(Object.isFrozen(registered)).toBe(true);
  });

  it('registers and resolves every built-in case-insensitively', () => {
    const registry = new FunctionRegistry();
    expect(registry.list().sort()).toEqual(
      [
        ...new Set([
          'ABS',
          'ACOS',
          'ACOSH',
          'ACOT',
          'ACOTH',
          'AGGREGATE',
          'ARABIC',
          'ARRAYTOTEXT',
          'ASIN',
          'ASINH',
          'ATAN',
          'ATAN2',
          'ATANH',
          'AVERAGE',
          'BASE',
          'CEILING.MATH',
          'CEILING.PRECISE',
          'COMBIN',
          'COMBINA',
          'COS',
          'COSH',
          'COT',
          'COTH',
          'COUNT',
          'CUBEKPIMEMBER',
          'CUBEMEMBER',
          'CUBEMEMBERPROPERTY',
          'CUBERANKEDMEMBER',
          'CUBESET',
          'CUBESETCOUNT',
          'CUBEVALUE',
          'CSC',
          'CSCH',
          'DATE',
          'DATEDIF',
          'DATEVALUE',
          'DAY',
          'DAYS',
          'DAYS360',
          'DECIMAL',
          'DEGREES',
          'DOLLAR',
          'EDATE',
          'EOMONTH',
          'EPOCHTODATE',
          'EVEN',
          'EXP',
          'FACT',
          'FACTDOUBLE',
          'FIXED',
          'FLOOR.MATH',
          'FLOOR.PRECISE',
          'GCD',
          'HOUR',
          'IF',
          'IFERROR',
          'LET',
          'INT',
          'ISO.CEILING',
          'ISOWEEKNUM',
          'LCM',
          'LN',
          'LOG',
          'LOG10',
          'MDETERM',
          'MINUTE',
          'MINVERSE',
          'MMULT',
          'MOD',
          'MONTH',
          'MROUND',
          'MULTINOMIAL',
          'MUNIT',
          'NETWORKDAYS',
          'NETWORKDAYS.INTL',
          'NOW',
          'NUMBERVALUE',
          'ODD',
          'PERCENTOF',
          'PI',
          'POWER',
          'PRODUCT',
          'QUOTIENT',
          'RADIANS',
          'RAND',
          'RANDARRAY',
          'RANDBETWEEN',
          'ROMAN',
          'ROUND',
          'ROUNDDOWN',
          'ROUNDUP',
          'SEC',
          'SECH',
          'SECOND',
          'SEQUENCE',
          'SERIESSUM',
          'SIGN',
          'SIN',
          'SINH',
          'SQRT',
          'SQRTPI',
          'SUBTOTAL',
          'SUM',
          'SUMIF',
          'SUMIFS',
          'SUMPRODUCT',
          'SUMSQ',
          'SUMX2MY2',
          'SUMX2PY2',
          'SUMXMY2',
          'TAN',
          'TANH',
          'TEXT',
          'TIME',
          'TIMEVALUE',
          'TODAY',
          'TO_DATE',
          'TRUNC',
          'VALUETOTEXT',
          'VLOOKUP',
          'WEEKDAY',
          'WEEKNUM',
          'WORKDAY',
          'WORKDAY.INTL',
          'YEAR',
          'YEARFRAC',
          ...textFunctions.map((fn) => fn.name),
          ...addInFunctions.map((fn) => fn.name),
          ...compatibilityFunctions.map((fn) => fn.name),
          ...databaseFunctions.map((fn) => fn.name),
          ...informationFunctions.map((fn) => fn.name),
          ...logicalFunctions.map((fn) => fn.name),
          ...webFunctions.map((fn) => fn.name),
          ...mathFunctions.map((fn) => fn.name),
          ...financialFunctions.map((fn) => fn.name),
          ...googleFunctions.map((fn) => fn.name),
          ...lookupFunctionNames,
        ]),
      ].sort(),
    );
    for (const name of registry.list()) expect(registry.get(name.toLowerCase())).toBeDefined();
  });
});

describe('AVERAGE', () => {
  it('averages direct values and numeric cells', () => {
    expect(evaluate('=AVERAGE(1,2,3)')).toBe(2);
    expect(evaluate('=AVERAGE(A1:A3)', { '0,0': 2, '1,0': 4, '2,0': 'ignored' })).toBe(3);
    expect(evaluate('=AVERAGE(A1:A2)', { '0,0': 'x' }, [2, 1])).toEqual({ kind: 'error', code: '#DIV/0!' });
  });

  it('supports whole-row and whole-column references', () => {
    expect(evaluate('=AVERAGE(A:A)', { '0,0': 2, '1,0': 4 }, [2, 1])).toBe(3);
    expect(evaluate('=AVERAGE(1:1)', { '0,0': 2, '0,1': 4 }, [1, 2])).toBe(3);
  });

  it('supports workbook-qualified range references', () => {
    expect(
      evaluate("=AVERAGE('Sales Data'!A1:B2)", {
        'Sales Data:0,0': 2,
        'Sales Data:0,1': 4,
        'Sales Data:1,0': 6,
        'Sales Data:1,1': 'ignored',
      }),
    ).toBe(4);
  });

  it('returns DIV/0 when no direct numeric values are supplied', () => {
    expect(evaluate('=AVERAGE()')).toEqual({ kind: 'error', code: '#DIV/0!' });
  });
});

describe('COUNT', () => {
  it('ignores workbook-qualified range cell errors consistently with sheet-local ranges', () => {
    expect(
      evaluate('=COUNT(Sheet2!A1:A1)', {
        'Sheet2:0,0': { kind: 'error', code: '#REF!' },
      }),
    ).toBe(0);
  });
});

describe('IF and IFERROR', () => {
  it('short-circuits the unselected IF branch', () => {
    expect(evaluate('=IF(TRUE,1,1/0)')).toBe(1);
    expect(evaluate('=IF(FALSE,1,1/0)')).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=IF(FALSE,1)')).toBe(false);
  });

  it('short-circuits IFERROR fallback and handles fallback errors', () => {
    expect(evaluate('=IFERROR(10,1/0)')).toBe(10);
    expect(evaluate('=IFERROR(1/0,99)')).toBe(99);
    expect(evaluate('=IFERROR(1/0,1/0)')).toEqual({ kind: 'error', code: '#DIV/0!' });
  });
});

describe('SUMIF', () => {
  const data = { '0,0': 5, '1,0': 12, '2,0': 18, '3,0': 7, '0,1': 50, '1,1': 120, '2,1': 180, '3,1': 70 } as Record<
    string,
    FormulaValue
  >;

  it('supports numeric comparisons and an alternate sum range', () => {
    expect(evaluate('=SUMIF(A1:A4,">10",B1:B4)', data)).toBe(300);
    expect(evaluate('=SUMIF(A1:A4,">=12")', data)).toBe(30);
  });

  it('supports workbook-qualified criteria and sum ranges', () => {
    expect(
      evaluate('=SUMIF(Sheet2!A1:A4,">10",Sheet2!B1:B4)', {
        'Sheet2:0,0': 5,
        'Sheet2:1,0': 12,
        'Sheet2:2,0': 18,
        'Sheet2:3,0': 7,
        'Sheet2:0,1': 50,
        'Sheet2:1,1': 120,
        'Sheet2:2,1': 180,
        'Sheet2:3,1': 70,
      }),
    ).toBe(300);
  });

  it('defines mixed-source SUMIF ranges by relative offsets', () => {
    expect(
      evaluate('=SUMIF(Sheet2!A1:A3,">10",B1:B3)', {
        'Sheet2:0,0': 5,
        'Sheet2:1,0': 12,
        'Sheet2:2,0': 18,
        '0,1': 50,
        '1,1': 120,
        '2,1': 180,
      }),
    ).toBe(300);
  });

  it('supports wildcard and escaped wildcard criteria', () => {
    const textData = { '0,0': 'North', '1,0': 'South', '2,0': 'N*', '0,1': 1, '1,1': 2, '2,1': 4 } as Record<
      string,
      FormulaValue
    >;
    expect(evaluate('=SUMIF(A1:A3,"S*",B1:B3)', textData)).toBe(2);
    expect(evaluate('=SUMIF(A1:A3,"N~*",B1:B3)', textData)).toBe(4);
    expect(evaluate('=SUMIF(A1:A3,"~N~*",B1:B3)', textData)).toBe(0);
  });
});

describe('VLOOKUP', () => {
  const data = { '0,0': 1, '0,1': 'one', '1,0': 3, '1,1': 'three', '2,0': 5, '2,1': 'five' } as Record<
    string,
    FormulaValue
  >;

  it('supports exact and approximate lookup', () => {
    expect(evaluate('=VLOOKUP(3,A1:B3,2,FALSE)', data)).toBe('three');
    expect(evaluate('=VLOOKUP(4,A1:B3,2,TRUE)', data)).toBe('three');
    expect(evaluate('=VLOOKUP(0,A1:B3,2,FALSE)', data)).toEqual({ kind: 'error', code: '#N/A' });
  });

  it('supports workbook-qualified table ranges', () => {
    expect(
      evaluate('=VLOOKUP(3,Sheet2!A1:B3,2,FALSE)', {
        'Sheet2:0,0': 1,
        'Sheet2:0,1': 'one',
        'Sheet2:1,0': 3,
        'Sheet2:1,1': 'three',
        'Sheet2:2,0': 5,
        'Sheet2:2,1': 'five',
      }),
    ).toBe('three');
  });

  it('returns the first duplicate for exact lookup and the last duplicate for approximate lookup', () => {
    const duplicateData = {
      '0,0': 1,
      '0,1': 'first',
      '1,0': 1,
      '1,1': 'last',
      '2,0': 2,
      '2,1': 'next',
    } as Record<string, FormulaValue>;

    expect(evaluate('=VLOOKUP(1,A1:B3,2,FALSE)', duplicateData)).toBe('first');
    expect(evaluate('=VLOOKUP(1,A1:B3,2,TRUE)', duplicateData)).toBe('last');
  });

  it('continues through duplicate text keys in approximate lookup', () => {
    const duplicateData = {
      '0,0': 'alpha',
      '0,1': 'first',
      '1,0': 'alpha',
      '1,1': 'last',
      '2,0': 'beta',
      '2,1': 'next',
    } as Record<string, FormulaValue>;

    expect(evaluate('=VLOOKUP("alpha",A1:B3,2)', duplicateData)).toBe('last');
  });

  it('validates the result column index', () => {
    expect(evaluate('=VLOOKUP(1,A1:B3,0,FALSE)', data)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=VLOOKUP(1,A1:B3,3,FALSE)', data)).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=VLOOKUP(7,A1:B3,3,FALSE)', data)).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=VLOOKUP(2,FALSE,3,FALSE)', data)).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=VLOOKUP(7,A1:B3,"TRUE",FALSE)', data)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=VLOOKUP(2,"汉字",3,FALSE)', data)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=VLOOKUP(7,A1:B3,C1,FALSE)', { ...data, '0,2': 'TRUE' })).toEqual({ kind: 'error', code: '#N/A' });
    expect(evaluate('=VLOOKUP(3,A1:B3,C1,FALSE)', { ...data, '0,2': 'TRUE' })).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=VLOOKUP(7,A1:B3,IF(TRUE,C1,0),FALSE)', { ...data, '0,2': 'TRUE' })).toEqual({ kind: 'error', code: '#N/A' });
  });

  it('accepts array tables and skips errors in lookup keys', () => {
    expect(evaluate('=VLOOKUP(2,{1,2;2,3},2,FALSE)')).toBe(3);
    expect(evaluate('=VLOOKUP(2,A1:B3,2,FALSE)', {
      '0,0': { kind: 'error', code: '#DIV/0!' },
      '1,0': 2,
      '1,1': 'two',
    })).toBe('two');
  });
});
