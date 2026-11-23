import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { FunctionRegistry } from '../src/functions';
import { FormulaErrorCode, type EvalContext, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { applyAggregate } from '../src/functions/math/aggregation/aggregateUtils';

function createContext(
  data: Record<string, FormulaValue> = {},
  shape: [number, number] = [100, 100],
  random = 0.5,
): EvalContext {
  return {
    isCellInBounds: (row, column) => row >= 0 && row < shape[0] && column >= 0 && column < shape[1],
    getSheetShape: () => shape,
    getCellValue: (row, column) => data[`${row},${column}`] ?? 0,
    *iterateRange(startRow, startColumn, endRow, endColumn) {
      for (let row = startRow; row <= endRow; row++) {
        for (let column = startColumn; column <= endColumn; column++) {
          yield data[`${row},${column}`] ?? 0;
        }
      }
    },
    random: () => random,
  };
}

function evaluate(
  formula: string,
  data: Record<string, FormulaValue> = {},
  shape: [number, number] = [100, 100],
): FormulaValue {
  const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
  return evaluator.evaluate(new FormulaParser().parse(formula), createContext(data, shape));
}

describe('math and trigonometry built-ins', () => {
  it('BUG-336 applies ABS to each array element', () => {
    expect(evaluate('=ABS({-1,2})')).toEqual([[1, 2]]);
    expect(evaluate('=ABS(IF({TRUE,FALSE},-1,1/0))'))
      .toEqual([[1, { kind: 'error', code: FormulaErrorCode.DivisionByZero }]]);
  });

  it('BUG-250 requires the row count in SEQUENCE', () => {
    expect(evaluate('=SEQUENCE()')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=SEQUENCE(,2)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=SEQUENCE(1)')).toEqual([[1]]);
    expect(evaluate('=SEQUENCE(1048577,1)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('BUG-720 reports an empty aggregate median as a numeric-set error', () => {
    expect(applyAggregate(12, [])).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(applyAggregate(12, [{ value: 2 }, { value: 4 }])).toBe(3);
  });

  it('BUG-721 counts error cells in SUBTOTAL and AGGREGATE like COUNT and COUNTA', () => {
    const data: Record<string, FormulaValue> = {
      '0,0': 1,
      '1,0': { kind: 'error', code: FormulaErrorCode.DivisionByZero },
    };
    expect(evaluate('=COUNT(A1:A2)', data)).toBe(1);
    expect(evaluate('=COUNTA(A1:A2)', data)).toBe(2);
    expect(evaluate('=SUBTOTAL(2,A1:A2)', data)).toBe(1);
    expect(evaluate('=SUBTOTAL(3,A1:A2)', data)).toBe(2);
    expect(evaluate('=AGGREGATE(2,0,A1:A2)', data)).toBe(1);
    expect(evaluate('=AGGREGATE(3,0,A1:A2)', data)).toBe(2);
    expect(evaluate('=AGGREGATE(3,2,A1:A2)', data)).toBe(1);
    expect(evaluate('=SUBTOTAL(9,A1:A2)', data)).toEqual(data['1,0']);
    expect(evaluate('=AGGREGATE(9,0,A1:A2)', data)).toEqual(data['1,0']);
  });

  it('BUG-722 resolves tied aggregate modes like MODE.SNGL', () => {
    expect(evaluate('=MODE.SNGL({2;2;1;1})')).toBe(1);
    expect(evaluate('=AGGREGATE(13,0,{2;2;1;1})')).toBe(1);
    expect(evaluate('=AGGREGATE(13,0,{1;1;2;2})')).toBe(1);
    expect(evaluate('=AGGREGATE(13,0,{1;2;3})'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
  });

  it('caps positive COMBIN inputs at the WPS integer bound while keeping COMBINA as an extension', () => {
    expect(evaluate('=COMBIN(1000000000000,1)')).toBe(2_147_483_647);
    expect((evaluate('=COMBIN(1000000000000,3)') as number) / 1.65058671443549e27).toBeCloseTo(1, 12);
    expect((evaluate('=COMBIN(1000000000000000,3)') as number) / 1.65058671443549e27).toBeCloseTo(1, 12);
    expect(evaluate('=COMBIN(-1000000000000,3)')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=COMBINA(1000000000000,1)')).toBe(1000000000000);
  });

  it('BUG-121 rejects negative double factorial inputs in current WPS', () => {
    expect(evaluate('=FACTDOUBLE(-1)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=FACTDOUBLE("-1")')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=FACTDOUBLE(-0.5)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=FACTDOUBLE(-1E-12)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=FACTDOUBLE(-1.005)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=FACT(-1)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=FACTDOUBLE(0)')).toBe(1);
  });

  it('BUG-124 keeps exact decimal multiples in the FLOOR family', () => {
    for (const name of ['FLOOR.MATH', 'FLOOR.PRECISE']) {
      expect(evaluate(`=${name}(1.2,0.1)`)).toBe(1.2);
      expect(evaluate(`=${name}(0.3,0.1)`)).toBe(0.3);
    }
    expect(evaluate('=FLOOR(0.3,0.1)')).toBe(0.3);
    expect(evaluate('=FLOOR.MATH(0.3-1E-12,0.1)')).toBeCloseTo(0.2);
  });

  it('BUG-125 keeps expression values at the CEILING boundary', () => {
    for (const name of ['CEILING.MATH', 'CEILING.PRECISE', 'CEILING']) {
      expect(evaluate(`=${name}(0.1+0.2,0.1)`)).toBeCloseTo(0.3);
    }
    expect(evaluate('=CEILING.MATH(0.3+1E-12,0.1)')).toBeCloseTo(0.4);
    expect(evaluate('=FLOOR.MATH(0.1+0.2,0.1)')).toBeCloseTo(0.3);
  });

  it('BUG-126 does not round a decimal-boundary expression up an extra step', () => {
    expect(evaluate('=ROUNDUP(0.1+0.2,1)')).toBe(0.3);
    expect(evaluate('=ROUNDUP(-0.1-0.2,1)')).toBe(-0.3);
    expect(evaluate('=ROUNDUP(0.3+1E-12,1)')).toBe(0.4);
    expect(evaluate('=ROUND(0.1+0.2,1)')).toBe(0.3);
    expect(evaluate('=ROUNDDOWN(0.1+0.2,1)')).toBe(0.3);
  });

  it('BUG-113 rounds decimal half values away from zero', () => {
    expect(evaluate('=ROUND(1.005,2)')).toBe(1.01);
    expect(evaluate('=ROUND(-1.005,2)')).toBe(-1.01);
    expect(evaluate('=ROUND(2.675,2)')).toBe(2.68);
    expect(evaluate('=ROUND(1.004,2)')).toBe(1);
  });

  const cases: Array<[string, FormulaValue]> = [
    ['=ABS(-2)', 2],
    ['=ACOS(1)', 0],
    ['=ACOSH(2)', Math.acosh(2)],
    ['=ACOT(1)', Math.PI / 4],
    ['=ACOTH(2)', 0.5 * Math.log(3)],
    ['=AGGREGATE(4,6,{1,2,3})', 3],
    ['=ARABIC("MCMXCIX")', 1999],
    ['=ASIN(0)', 0],
    ['=ASINH(0)', 0],
    ['=ATAN(0)', 0],
    ['=ATAN2(0,1)', Math.PI / 2],
    ['=ATANH(0)', 0],
    ['=BASE(31,16)', '1F'],
    ['=CEILING.MATH(24.3,5)', 25],
    ['=CEILING.PRECISE(-4.3,2)', -4],
    ['=COMBIN(8,2)', 28],
    ['=COMBINA(4,3)', 20],
    ['=COS(0)', 1],
    ['=COSH(0)', 1],
    ['=COT(RADIANS(45))', 1],
    ['=COTH(1)', 1 / Math.tanh(1)],
    ['=CSC(PI()/2)', 1],
    ['=CSCH(1)', 1 / Math.sinh(1)],
    ['=DECIMAL("1010",2)', 10],
    ['=DEGREES(PI())', 180],
    ['=EVEN(1.5)', 2],
    ['=EXP(0)', 1],
    ['=FACT(5)', 120],
    ['=FACTDOUBLE(7)', 105],
    ['=FLOOR.MATH(-8.1,2)', -10],
    ['=FLOOR.PRECISE(-3.2,1)', -4],
    ['=GCD(24,36)', 12],
    ['=INT(-0.1)', -1],
    ['=ISO.CEILING(-4.3,2)', -4],
    ['=LCM(4,6)', 12],
    ['=LN(1)', 0],
    ['=LOG(8,2)', 3],
    ['=LOG10(100)', 2],
    ['=MDETERM({1,2;3,4})', -2],
    [
      '=MINVERSE({1,2;3,4})',
      [
        [-2, 1],
        [1.5, -0.5],
      ],
    ],
    ['=MMULT({1,2},{3;4})', 11],
    ['=MOD(-3,2)', 1],
    ['=MROUND(10,3)', 9],
    ['=MULTINOMIAL(1,1,1)', 6],
    [
      '=MUNIT(2)',
      [
        [1, 0],
        [0, 1],
      ],
    ],
    ['=ODD(0)', 1],
    ['=PERCENTOF({25},{100})', 0.25],
    ['=PERCENTOF(TRUE,{100})', 0.01],
    ['=PI()*0', 0],
    ['=POWER(2,0)', 1],
    ['=PRODUCT(1,2,3)', 6],
    ['=QUOTIENT(-10,3)', -3],
    ['=RADIANS(180)', Math.PI],
    ['=RANDARRAY(1,4,5,5,TRUE)', [[5, 5, 5, 5]]],
    ['=RANDBETWEEN(7,7)', 7],
    ['=ROMAN(2024)', 'MMXXIV'],
    ['=ROUND(-1.475,2)', -1.48],
    ['=ROUND(12345.678,-45000)', 0],
    ['=ROUNDDOWN(-3.9,0)', -3],
    ['=ROUNDDOWN(12345.678,-45000)', 0],
    ['=ROUNDUP(-3.1,0)', -4],
    ['=SEC(0)', 1],
    ['=SECH(0)', 1],
    [
      '=SEQUENCE(2,3,0,2)',
      [
        [0, 2, 4],
        [6, 8, 10],
      ],
    ],
    ['=SEQUENCE(2.675,1.005,1,1)', [[1], [2]]],
    ['=SEQUENCE(1,4,1,-1.005)', [[1, -0.005, -1.01, -2.015]]],
    ['=SEQUENCE(1,2,1000000000000000,1)', [[1000000000000000, 1000000000000000]]],
    ['=SEQUENCE(1,17,1000000000000000,1)', [[
      1000000000000000, 1000000000000000, 1000000000000000, 1000000000000000,
      1000000000000000, 1000000000000000, 1000000000000010, 1000000000000010,
      1000000000000010, 1000000000000010, 1000000000000010, 1000000000000010,
      1000000000000010, 1000000000000010, 1000000000000010, 1000000000000010,
      1000000000000020,
    ]]],
    ['=SERIESSUM(2,0,1,{1,2,3})', 17],
    ['=SIGN(0)', 0],
    ['=SIN(0)', 0],
    ['=SINH(0)', 0],
    ['=SQRT(0)', 0],
    ['=SQRTPI(0)', 0],
    ['=SUBTOTAL(9,A1:A3)', 6],
    ['=SUM(10,20,30)', 60],
    ['=SUM("2024-02-29")', 45351],
    ['=SUMIF({1,2,3},">1",{10,20,30})', 50],
    ['=SUMIFS({10;20;30;40},{"已完成";"已取消";"已完成";"已完成"},"已完成")', 80],
    ['=SUMPRODUCT({2,3,4},{10,20,30})', 200],
    ['=SUMSQ(0,3)', 9],
    ['=SUMX2MY2({1,2},{3,4})', -20],
    ['=SUMX2PY2({1,2},{3,4})', 30],
    ['=SUMXMY2({1,2},{3,4})', 8],
    ['=TAN(0)', 0],
    ['=TANH(0)', 0],
    ['=TRUNC(-3.9)', -3],
    ['=TRUNC(12345.678,-45000)', 0],
  ];

  it.each(cases)('%s', (formula, expected) => {
    const actual = evaluate(formula, formula.includes('SUBTOTAL') ? { '0,0': 1, '1,0': 2, '2,0': 3 } : {});
    if (typeof expected === 'number') {
      expect(actual).toEqual(expect.closeTo(expected, 10));
    } else {
      expect(actual).toEqual(expected);
    }
  });
});

describe('math built-in error and reference behavior', () => {
  it('BUG-703 returns a numeric error for a non-finite SEQUENCE element', () => {
    expect(evaluate('=INDEX(SEQUENCE(2,1,1E308,1E308),2,1)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=ISNUMBER(INDEX(SEQUENCE(2,1,1E308,1E308),2,1))')).toBe(false);
  });

  it('BUG-890 allows SEQUENCE dimensions above 10000 within the array cell budget', () => {
    expect(evaluate('=ROWS(SEQUENCE(10000))')).toBe(10000);
    expect(evaluate('=ROWS(SEQUENCE(10001))')).toBe(10001);
  });

  it('BUG-891 returns a numeric error for a computed non-finite SEQUENCE step', () => {
    expect(evaluate('=INDEX(SEQUENCE(2,1,1,1E308*2),2,1)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=1+1')).toBe(2);
  });

  it('sums only numeric cells in PERCENTOF references', () => {
    expect(evaluate('=PERCENTOF(A1:C1,{100})', { '0,0': '001', '0,1': 1, '0,2': 2 })).toBe(0.03);
    expect(evaluate('=PERCENTOF(A1,{100})', { '0,0': true })).toBe(0);
    expect(evaluate('=PERCENTOF({25},A1:C1)', { '0,0': '001', '0,1': 10, '0,2': 15 })).toBe(1);
    expect(evaluate('=PERCENTOF(A1,{100})', {
      '0,0': { kind: 'error', code: FormulaErrorCode.Reference },
    })).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=PERCENTOF(IF(TRUE,A1,0),{100})', {
      '0,0': { kind: 'error', code: FormulaErrorCode.Reference },
    })).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=PERCENTOF({25},A1)', {
      '0,0': { kind: 'error', code: FormulaErrorCode.DivisionByZero },
    })).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=PERCENTOF("abc",{100})')).toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('returns numeric errors for invalid domains', () => {
    expect(evaluate('=SQRT(-1)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=ACOS(2)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=MOD(1,0)')).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=POWER(0,-1)')).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=POWER(-1,0.5)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=MROUND(5,-2)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=GCD(-0.1,5)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=LCM(4,-6)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=LCM("0",456)')).toBe(0);
    expect(evaluate('=LCM(A1,456)', { '0,0': '0' })).toBe(456);
    expect(evaluate('=LCM(123,A1)', { '0,0': '-1' })).toBe(123);
    expect(evaluate('=LCM(123,IF(TRUE,A1,0))', { '0,0': '-1' })).toBe(123);
    expect(evaluate('=LCM(123,"-1")')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=LCM(123,A1)', { '0,0': false })).toBe(123);
    expect(evaluate('=LCM(123,FALSE)')).toBe(0);
    expect(evaluate('=LCM(A1,456)', { '0,0': 'abc' })).toBe(456);
    expect(evaluate('=LCM("",456)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=MINVERSE({1,2;2,4})')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=MMULT({1,2},{3,4})')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=COSH(1000)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=SINH(-1000)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=COSH("")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=SINH(A1)', { '0,0': '' })).toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('truncates nonnegative Roman inputs and rejects values outside the supported range', () => {
    expect(evaluate('=ROMAN(0)')).toBe('');
    expect(evaluate('=ROMAN(0.5)')).toBe('');
    expect(evaluate('=ROMAN(-1e-12)')).toBe('');
    expect(evaluate('=ROMAN(A1)', { '0,0': -1e-12 })).toBe('');
    expect(evaluate('=ROMAN(-0.5)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=ROMAN(-1)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=ROMAN(45000)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=ROMAN("2024-02-29")')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=ROMAN(2024,45000)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=ROMAN(IF(TRUE,-1,0))')).toEqual({ kind: 'error', code: '#NUM!' });
  });

  it('coerces date text in numeric math arguments', () => {
    expect(evaluate('=ABS("2024-02-29")')).toBe(45351);
    expect(evaluate('=ROUND("2024-02-29",0)')).toBe(45351);
  });

  it('rejects nonnumeric and empty matrix entries', () => {
    expect(evaluate('=MDETERM(A1)', { '0,0': '1' })).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=MINVERSE(A1)', { '0,0': true })).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(evaluate('=MMULT({1,"2"},{3;4})')).toEqual({ kind: 'error', code: '#VALUE!' });
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
    const context = createContext();
    context.iterateRangeCells = function* iterateRangeCells() {
      yield { row: 0, col: 0, value: 0, source: 'empty' as const };
    };
    expect(evaluator.evaluate(new FormulaParser().parse('=MDETERM(A1)'), context)).toEqual({
      kind: 'error', code: '#VALUE!',
    });
  });

  it('keeps matrix cell errors ahead of shape errors', () => {
    const data: Record<string, FormulaValue> = { '0,0': { kind: 'error', code: FormulaErrorCode.NotAvailable } };
    expect(evaluate('=MDETERM(A1:A8)', data)).toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
    expect(evaluate('=MINVERSE(A1:A8)', data)).toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
  });

  it('rejects a direct empty text argument to GCD', () => {
    expect(evaluate('=GCD("",67890)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=GCD(A1,67890)', { '0,0': '' })).toBe(67890);
    expect(evaluate('=GCD(A1,67890)', { '0,0': '2024-02-29' })).toBe(67890);
    expect(evaluate('=GCD(A1,67890)', { '0,0': true })).toBe(67890);
    expect(evaluate('=GCD(IF(TRUE,A1,0),67890)', { '0,0': true })).toBe(67890);
    expect(evaluate('=GCD(12345,IF(TRUE,A1,0))', { '0,0': false })).toBe(12345);
    expect(evaluate('=GCD(12345,A1)', { '0,0': '1' })).toBe(12345);
    expect(evaluate('=GCD(12345,IF(TRUE,A1,0))', { '0,0': '-1' })).toBe(12345);
    expect(evaluate('=GCD(A1,67890)', { '0,0': 3 })).toBe(3);
    expect(evaluate('=GCD("2024-02-29",67890)')).toBe(3);
    expect(evaluate('=LCM(A1,456)', { '0,0': '2024-02-29' }))
      .toBe(456);
    expect(evaluate('=LCM(123,IF(TRUE,A1,0))', { '0,0': false }))
      .toBe(123);
    expect(evaluate('=LCM(IF(TRUE,A1,0),456)', { '0,0': true })).toBe(456);
    expect(evaluate('=GCD(IF(TRUE,A1,0),67890)', { '0,0': '2024-02-29' })).toBe(67890);
  });

  it('propagates matrix cell errors before reporting incompatible dimensions', () => {
    expect(evaluate('=MMULT(A1,{5,6;7,8})', {
      '0,0': { kind: 'error', code: '#REF!' },
    })).toEqual({ kind: 'error', code: '#REF!' });
    expect(evaluate('=MMULT({1,2;3,4},A1)', {
      '0,0': { kind: 'error', code: '#DIV/0!' },
    })).toEqual({ kind: 'error', code: '#DIV/0!' });
  });

  it('preserves IF-selected references in SUMIF range arguments', () => {
    const data: Record<string, FormulaValue> = { '0,0': 1, '1,0': 3, '0,1': 10, '1,1': 30 };
    expect(evaluate('=SUMIF(IF(TRUE,A1,0),">5000",A1:A2)', data)).toBe(0);
    expect(evaluate('=SUMIF(A1:A2,">0",IF(TRUE,B1,0))', data)).toBe(40);
  });

  it('checks SUMIFS range dimensions before reading an IF-selected error cell', () => {
    const data: Record<string, FormulaValue> = {
      '0,0': { kind: 'error', code: FormulaErrorCode.NotAvailable },
    };
    expect(evaluate('=SUMIFS(IF(TRUE,A1,0),A1:A100,">5000")', data))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('treats selected SUM references as cells and rejects empty literal text', () => {
    expect(evaluate('=SUM(IF(TRUE,A1,0))', { '0,0': true })).toBe(0);
    expect(evaluate('=SUM(IF(TRUE,A1,0))', { '0,0': '1' })).toBe(0);
    expect(evaluate('=SUM("")')).toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('BUG-322 and BUG-1024 enforce the spreadsheet trigonometric argument limit', () => {
    for (const [name, operation] of [['SIN', Math.sin], ['COS', Math.cos], ['TAN', Math.tan]] as const) {
      for (const value of [134217727, -134217727]) {
        expect(evaluate(`=${name}(${value})`)).toBeCloseTo(operation(value), 12);
      }
      for (const value of [134217728, -134217728, 1e12, -1e15]) {
        expect(evaluate(`=${name}(${value})`)).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
      }
      expect(evaluate(`=${name}(A1)`, { '0,0': 134217728 }))
        .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
      expect(evaluate(`=${name}(A1)`, { '0,0': 134217727 })).toBeCloseTo(operation(134217727), 12);
    }
    expect(evaluate('=COS(1)')).toBeCloseTo(Math.cos(1), 12);
  });

  it('matches WPS inverse-hyperbolic sine at negative boundaries', () => {
    expect(evaluate('=ASINH(-45000)')).toBeCloseTo(-11.4075652656129, 11);
    expect(evaluate('=ASINH(A1)', { '0,0': -45000 })).toBeCloseTo(-11.4075652656129, 11);
    expect(evaluate('=ASINH(-1000000000000)')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=ASINH(A1)', { '0,0': -1e12 })).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=ASINH(45000)')).toBeCloseTo(11.407564949435859, 12);
  });

  it('BUG-1056 follows WPS coefficient coercion through an IF reference', () => {
    for (const formula of [
      '=SERIESSUM(TRUE,0,1,{1,2,3})',
      '=SERIESSUM(2,FALSE,1,{1,2,3})',
      '=SERIESSUM(2,0,TRUE,{1,2,3})',
    ]) expect(evaluate(formula)).toBe(formula.startsWith('=SERIESSUM(TRUE') ? 6 : 17);
    expect(evaluate('=SERIESSUM(2,0,1,{1,2,3})')).toBe(17);
    expect(evaluate('=SERIESSUM(2,0,1,IF(TRUE,A1,0))', { '0,0': ' a ' }))
      .toBe(0);
    expect(evaluate('=SERIESSUM(2,0,1,IF(TRUE,A1,0))', { '0,0': 'abc' }))
      .toBe(0);
    expect(evaluate('=SERIESSUM(2,0,1,A1)', { '0,0': ' a ' }))
      .toBe(0);
    expect(evaluate('=SERIESSUM(2,0,1,IF(TRUE,A1,0))', { '0,0': 3 })).toBe(3);
  });

  it('rejects empty text and negative fractional MULTINOMIAL inputs before truncation', () => {
    expect(evaluate('=MULTINOMIAL("",4,5)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=MULTINOMIAL(3,-0.5,5)')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=MULTINOMIAL(3,-1E-12,5)')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=MULTINOMIAL(3,0.5,5)')).toBe(56);
    expect(evaluate('=MULTINOMIAL(A1,4,5)', { '0,0': true })).toBe(126);
    expect(evaluate('=MULTINOMIAL(3,A1,5)', { '0,0': '2024-02-29' })).toBe(56);
    expect(evaluate('=MULTINOMIAL(3,IF(TRUE,A1,0),5)', { '0,0': '-1' })).toBe(56);
    expect(evaluate('=MULTINOMIAL(3,IF(TRUE,A1,0),5)', { '0,0': '2024-02-29' })).toBe(56);
    expect(evaluate('=MULTINOMIAL(3,IF(TRUE,A1,0),5)', { '0,0': '1' })).toBe(56);
    expect(evaluate('=MULTINOMIAL(3,IF(TRUE,A1,0),5)', { '0,0': 'abc' })).toBe(56);
    expect(evaluate('=MULTINOMIAL(A1,4,5)', { '0,0': '' })).toBe(126);
    expect(evaluate('=MULTINOMIAL(3,"1",5)')).toBe(504);
    expect(evaluate('=MULTINOMIAL(3,"",5)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('uses product boundary results for LOG, ARABIC, and referenced SUMIF values', () => {
    expect(evaluate('=LOG(86,1)')).toEqual({ kind: 'error', code: FormulaErrorCode.DivisionByZero });
    expect(evaluate('=LOG(-86,1)')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=ARABIC("")')).toBe(0);
    expect(evaluate('=ARABIC(A1)', { '0,0': '' })).toBe(0);
    const blankContext: EvalContext = {
      ...createContext(),
      *iterateRangeCells() {
        yield { row: 0, col: 0, source: 'empty' as const, value: 0 };
      },
    };
    expect(new FormulaEvaluator(new FunctionRegistry(), new AggregationCache()).evaluate(
      new FormulaParser().parse('=ARABIC(A1)'), blankContext,
    )).toBe(0);
    expect(evaluate('=SUMIF(A1:A2,A1,A1:A2)', { '0,0': '1', '1,0': 2 })).toBe(0);
  });

  it('reports product arity errors for modern math functions', () => {
    for (const name of ['ACOT', 'ACOTH', 'COT', 'COTH', 'CSC', 'CSCH', 'SEC', 'SECH']) {
      expect(evaluate(`=${name}()`)).toEqual({ kind: 'error', code: FormulaErrorCode.Name });
      expect(evaluate(`=${name}(1,2)`)).toEqual({ kind: 'error', code: FormulaErrorCode.Name });
    }
    expect(evaluate('=COMBINA(3)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=COMBINA(3,2,1)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=DECIMAL("1010")')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=DECIMAL("1010",2,1)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=DECIMAL("",2)')).toBe(0);
    expect(evaluate('=DECIMAL(-1,2)')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
  });

  it('limits DECIMAL text to 255 characters', () => {
    expect(evaluate('=DECIMAL(REPT("1",256),2)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=ISERROR(DECIMAL(REPT("1",256),2))')).toBe(true);
    expect(evaluate('=ISERROR(DECIMAL(REPT("1",255),2))')).toBe(false);
  });

  it('rejects date text in modern trigonometric functions', () => {
    for (const name of ['ACOT', 'ACOTH', 'COT', 'COTH', 'CSC', 'CSCH', 'SEC', 'SECH']) {
      expect(evaluate(`=${name}("2024-02-29")`)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    }
    expect(evaluate('=ACOT("1")')).toBeCloseTo(Math.PI / 4, 12);
  });

  it('supports range-backed matrix and conditional functions', () => {
    const data = {
      '0,0': 1,
      '1,0': 2,
      '2,0': 3,
      '0,1': 10,
      '1,1': 20,
      '2,1': 30,
      '0,2': 'A',
      '1,2': 'B',
      '2,2': 'A',
    } as Record<string, FormulaValue>;
    expect(evaluate('=SUMPRODUCT(A1:A3,B1:B3)', data)).toBe(140);
    expect(evaluate('=SUMIFS(B1:B3,A1:A3,">1",C1:C3,"A")', data)).toBe(30);
    expect(evaluate('=SUMIFS(A1:A3,A1:A3,A1)', { '0,0': '1.5', '1,0': 2, '2,0': 3 })).toBe(0);
    expect(evaluate('=SUMX2MY2(A1:A3,B1:B3)', data)).toBe(-1386);
    for (const name of ['SUMX2MY2', 'SUMX2PY2', 'SUMXMY2']) {
      expect(evaluate(`=${name}(A1:A3,B1:B2)`, data)).toEqual({ kind: 'error', code: '#N/A' });
    }
  });

  it('pairs SUMX arrays by cell position and checks shape before cell errors', () => {
    expect(evaluate('=SUMX2MY2({1},{2})')).toBe(-3);
    const data: Record<string, FormulaValue> = {
      '0,0': 'first', '0,1': 'second', '1,0': 2, '1,1': 6, '2,0': 3, '2,1': 5,
    };
    expect(evaluate('=SUMX2MY2(A1:A3,B1:B3)', data)).toBe(-48);
    expect(evaluate('=SUMX2MY2(A1:B2,A1:A100)', {
      '0,0': { kind: 'error', code: FormulaErrorCode.Number },
    })).toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
    expect(evaluate('=SUMX2MY2(A1,A1:A100)', {
      '0,0': { kind: 'error', code: FormulaErrorCode.Number },
    })).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    for (const name of ['SUMX2MY2', 'SUMX2PY2', 'SUMXMY2']) {
      expect(evaluate(`=${name}("abc",A1:A100)`)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate(`=${name}(A1,A1:A100)`, { '0,0': 'abc' }))
        .toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate(`=${name}("1",A1:A100)`)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate(`=${name}(TRUE,A1:A100)`)).toEqual({ kind: 'error', code: '#VALUE!' });
      expect(evaluate(`=${name}({"1"},A1:A100)`)).toEqual({ kind: 'error', code: '#N/A' });
      expect(evaluate(`=${name}({TRUE},A1:A100)`)).toEqual({ kind: 'error', code: '#N/A' });
      expect(evaluate(`=${name}(A1,A1:A100)`, { '0,0': '1' }))
        .toEqual({ kind: 'error', code: '#VALUE!' });
    }

    const context = createContext({ '1,0': 2, '2,0': 3 });
    context.iterateRangeCells = function* iterateRangeCells(startRow, startColumn, endRow, endColumn) {
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startColumn; col <= endColumn; col++) {
          yield { row, col, value: context.getCellValue(row, col), source: row === 0 && col === 0 ? 'empty' : 'value' };
        }
      }
    };
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
    const parser = new FormulaParser();
    for (const name of ['SUMX2MY2', 'SUMX2PY2', 'SUMXMY2']) {
      expect(evaluator.evaluate(parser.parse(`=${name}(A1,A1:A3)`), context))
        .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    }
  });

  it('keeps equal large squares finite in SUMX2MY2', () => {
    expect(evaluate('=SUMX2MY2({1E200;2E200},{1E200;2E200})')).toBe(0);
    expect(evaluate('=SUMX2MY2({1E200;-2E200},{-1E200;2E200})')).toBe(0);
    expect(evaluate('=SUMX2MY2({3;5},{2;4})')).toBe(14);
  });

  it('aggregates numeric referenced cells while preserving direct argument coercion', () => {
    const data: Record<string, FormulaValue> = {
      '0,0': 2,
      '0,1': '3',
      '1,0': true,
    };
    const context = createContext(data, [2, 2]);
    context.iterateRangeCells = function* iterateRangeCells(startRow, startColumn, endRow, endColumn) {
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startColumn; col <= endColumn; col++) {
          const key = `${row},${col}`;
          yield { row, col, value: context.getCellValue(row, col), source: Object.hasOwn(data, key) ? 'value' : 'empty' };
        }
      }
    };
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
    const parser = new FormulaParser();
    const run = (formula: string) => evaluator.evaluate(parser.parse(formula), context);

    expect(run('=SUMSQ(A1:B2)')).toBe(4);
    expect(run('=SUMSQ(B1)')).toBe(0);
    expect(run('=SUMSQ("3")')).toBe(9);
    expect(run('=SUMSQ("")')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(run('=SUMSQ(IF(TRUE,B2,0))')).toBe(0);
    expect(run('=SUMSQ(IF(TRUE,B1,0))')).toBe(0);
    expect(run('=SUMSQ("2024-02-29")')).toBe(45351 ** 2);
    expect(run('=PRODUCT(A1:B2,5)')).toBe(10);
    expect(run('=PRODUCT(B1,5)')).toBe(5);
    expect(run('=PRODUCT(IF(TRUE,B1,0),5)')).toBe(5);
    expect(run('=PRODUCT("2024-02-29",5)')).toBe(45351 * 5);
    expect(run('=PRODUCT("abc",5)')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(run('=SERIESSUM(0,0,1,{1,2,3})')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(run('=SERIESSUM(2,0,1,{1,2,3})')).toBe(17);
    expect(run('=BASE(-0.5,16)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(run('=BASE(100,16,45000)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(run('=LCM(B2,4)')).toBe(4);
  });

  it('honors hidden rows for SUBTOTAL and AGGREGATE when metadata is available', () => {
    const context = createContext({ '0,0': 1, '1,0': 2, '2,0': 3 }, [3, 1]);
    context.iterateRangeCells = function* iterateRangeCells(startRow, startColumn, endRow, endColumn) {
      for (let row = startRow; row <= endRow; row++) {
        for (let column = startColumn; column <= endColumn; column++) {
          yield {
            row,
            col: column,
            value: context.getCellValue(row, column),
            hidden: row === 1,
          };
        }
      }
    };
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
    const parser = new FormulaParser();
    expect(evaluator.evaluate(parser.parse('=SUBTOTAL(109,A1:A3)'), context)).toBe(4);
    expect(evaluator.evaluate(parser.parse('=AGGREGATE(9,5,A1:A3)'), context)).toBe(4);
  });

  it('ignores numeric text stored in referenced cells during numeric aggregation', () => {
    const context = createContext({ '0,0': { kind: 'text', value: '1', numericCoercion: 'allow' }, '1,0': 2 }, [2, 1]);
    context.iterateRangeCells = function* iterateRangeCells(startRow, startColumn, endRow, endColumn) {
      for (let row = startRow; row <= endRow; row++) {
        for (let column = startColumn; column <= endColumn; column++) {
          yield { row, col: column, value: context.getCellValue(row, column), source: 'value' };
        }
      }
    };
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
    const parser = new FormulaParser();
    expect(evaluator.evaluate(parser.parse('=SUBTOTAL(109,A1:A2)'), context)).toBe(2);
    expect(evaluator.evaluate(parser.parse('=AGGREGATE(9,5,A1:A2)'), context)).toBe(2);
    expect(evaluator.evaluate(parser.parse('=SUBTOTAL(109,IF(TRUE,A1,0))'), context)).toBe(0);
  });

  it('excludes unoccupied cells and truncates SUBTOTAL function numbers', () => {
    const data: Record<string, FormulaValue> = { '0,0': 1, '2,0': 3 };
    const context = createContext(data, [5, 1]);
    context.iterateRangeCells = function* iterateRangeCells(startRow, startColumn, endRow, endColumn) {
      for (let row = startRow; row <= endRow; row++) {
        for (let column = startColumn; column <= endColumn; column++) {
          const key = `${row},${column}`;
          yield {
            row,
            col: column,
            value: context.getCellValue(row, column),
            source: Object.hasOwn(data, key) ? 'value' as const : 'empty' as const,
          };
        }
      }
    };
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
    const parser = new FormulaParser();
    const run = (formula: string) => evaluator.evaluate(parser.parse(formula), context);
    expect(run('=SUBTOTAL(1,A1:A5)')).toBe(2);
    expect(run('=SUBTOTAL(1.5,A1:A5)')).toBe(2);
    expect(run('=SUBTOTAL(3,A1:A5)')).toBe(2);
    expect(run('=SUBTOTAL(10,A1:A5)')).toBe(2);
    expect(run('=SUBTOTAL(1/0,A1:A5)')).toEqual({ kind: 'error', code: FormulaErrorCode.DivisionByZero });
  });

  it('normalizes negative AGGREGATE options and requires reference-like inputs', () => {
    expect(evaluate('=AGGREGATE(9,-1e-12,{1,2})')).toBe(3);
    expect(evaluate('=AGGREGATE(9,-0.5,{1,2})')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=AGGREGATE(9,-1,{1,2})')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=AGGREGATE(1/0,6,{1,2})')).toEqual({
      kind: 'error', code: FormulaErrorCode.DivisionByZero,
    });
    expect(evaluate('=AGGREGATE(9,1/0,{1,2})')).toEqual({
      kind: 'error', code: FormulaErrorCode.DivisionByZero,
    });
    expect(evaluate('=AGGREGATE(9,6,-60)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=AGGREGATE(9,6,"1.5")')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=AGGREGATE(9,6,{1,2})')).toBe(3);
    expect(evaluate('=AGGREGATE(14,6,{72;30;31;96;32;81;33;53;34},3)')).toBe(72);
  });
});

describe('math built-in registry and scale', () => {
  it('registers every documented math function', () => {
    const names = [
      'ABS',
      'ACOS',
      'ACOSH',
      'ACOT',
      'ACOTH',
      'AGGREGATE',
      'ARABIC',
      'ASIN',
      'ASINH',
      'ATAN',
      'ATAN2',
      'ATANH',
      'BASE',
      'CEILING.MATH',
      'CEILING.PRECISE',
      'COMBIN',
      'COMBINA',
      'COS',
      'COSH',
      'COT',
      'COTH',
      'CSC',
      'CSCH',
      'DECIMAL',
      'DEGREES',
      'EVEN',
      'EXP',
      'FACT',
      'FACTDOUBLE',
      'FLOOR.MATH',
      'FLOOR.PRECISE',
      'GCD',
      'INT',
      'ISO.CEILING',
      'LCM',
      'LN',
      'LOG',
      'LOG10',
      'MDETERM',
      'MINVERSE',
      'MMULT',
      'MOD',
      'MROUND',
      'MULTINOMIAL',
      'MUNIT',
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
      'TRUNC',
    ];
    const registry = new FunctionRegistry();
    for (const name of names) expect(registry.get(name)).toBeDefined();
    expect(names.every((name) => registry.has(name))).toBe(true);
  });

  it('scans 100,000 cells without expanding the formula AST', () => {
    const rows = 100_000;
    const context = createContext({}, [rows, 1]);
    context.getCellValue = (row) => row + 1;
    context.iterateRange = function* iterateRange(startRow, _startColumn, endRow) {
      for (let row = startRow; row <= endRow; row++) yield row + 1;
    };
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
    const parser = new FormulaParser();
    const start = performance.now();
    expect(evaluator.evaluate(parser.parse('=SUM(A1:A100000)'), context)).toBe(5_000_050_000);
    expect(performance.now() - start).toBeLessThan(2_000);
  });

  it('rejects an identity matrix that exceeds the formula array budget', () => {
    expect(evaluate('=MUNIT(1.8751)')).toEqual([[1]]);
    expect(evaluate('=MUNIT(0.875)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=MUNIT(10000)')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=MUNIT()')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=MUNIT(2,1)')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=MUNIT(A1)', { '0,0': { kind: 'error', code: FormulaErrorCode.Name } }))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Name });
  });

  it('rejects date text in multiple rounding functions', () => {
    for (const name of ['CEILING.MATH', 'CEILING.PRECISE', 'FLOOR.MATH', 'FLOOR.PRECISE', 'ISO.CEILING']) {
      expect(evaluate(`=${name}("2024-02-29",5)`))
        .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
      expect(evaluate(`=${name}(A1,5)`, { '0,0': '2024-02-29' }))
        .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    }
  });

  it('BUG-176 includes both integer RANDARRAY bounds', () => {
    expect(evaluate('=MAX(RANDARRAY(100,1,0,1,TRUE))')).toBe(1);
    expect(evaluate('=MAX(RANDARRAY(100,1,5,6,TRUE))')).toBe(6);
  });

  it('BUG-177 rejects extra array arguments in ranked AGGREGATE forms', () => {
    for (const functionNumber of [14, 15]) {
      expect(evaluate(`=AGGREGATE(${functionNumber},0,{1,2},{3,4},1)`))
        .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    }
    expect(evaluate('=AGGREGATE(14,0,{1,2},1)')).toBe(2);
  });

  it('BUG-178 and BUG-201 classify PERCENTOF input errors', () => {
    expect(evaluate('=PERCENTOF(1/0,100)')).toEqual({ kind: 'error', code: FormulaErrorCode.DivisionByZero });
    expect(evaluate('=PERCENTOF(1,1/0)')).toEqual({ kind: 'error', code: FormulaErrorCode.DivisionByZero });
    expect(evaluate('=ATAN2(0,0)')).toEqual({ kind: 'error', code: FormulaErrorCode.DivisionByZero });
  });

  it('BUG-203 applies the same ROMAN range error to literals and function results', () => {
    for (const input of ['-1', '4000'])
      expect(evaluate(`=ROMAN(${input})`)).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    for (const input of ['SUM(-1,0)', 'SUM(4000,0)'])
      expect(evaluate(`=ROMAN(${input})`)).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
  });

  it('BUG-230/231/232 ignores text in referenced numeric arrays', () => {
    const data: Record<string, FormulaValue> = { '0,7': 6, '1,7': '8', '2,7': 9 };
    expect(evaluate('=GCD(H1:H3)', data)).toBe(3);
    expect(evaluate('=LCM(H1:H3)', data)).toBe(18);
    expect(evaluate('=SUMPRODUCT(H1:H3)', data)).toBe(15);
    data['1,7'] = 'text';
    expect(evaluate('=GCD(H1:H3)', data)).toBe(3);
    expect(evaluate('=LCM(H1:H3)', data)).toBe(18);
  });

  it('BUG-328/437/904 rejects non-finite aggregates and too many SUM arguments', () => {
    for (const formula of ['=SUMSQ(1E200)', '=SUM(9E307,9E307)']) {
      expect(evaluate(formula)).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    }
    for (const name of ['SUM', 'AVERAGE', 'MAX', 'MIN', 'SUMSQ']) {
      expect(evaluate(`=${name}("1e309")`)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    }
    expect(evaluate(`=SUM(${Array(255).fill('1').join(',')})`)).toBe(255);
    expect(evaluate(`=SUM(${Array(256).fill('1').join(',')})`))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    const incremental = new FunctionRegistry().get('SUM')?.incrementalUpdate;
    expect(incremental?.(9e307, [{ key: 0, row: 0, col: 0, oldVal: 0, newVal: 9e307 }], [], createContext()))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
  });

  it('BUG-330/536/539 keeps representable rounded values finite', () => {
    for (const name of ['TRUNC', 'ROUND', 'ROUNDUP', 'ROUNDDOWN']) {
      expect(evaluate(`=${name}(9E307,1)`)).toBe(9e307);
    }
    for (const name of ['ROUND', 'ROUNDUP', 'ROUNDDOWN']) {
      expect(evaluate(`=${name}(1E308,2)`)).toBe(1e308);
    }
    for (const name of ['CEILING.MATH', 'FLOOR.MATH']) {
      expect(evaluate(`=${name}(1E308,1E-308)`)).toBe(1e308);
    }
    expect(evaluate('=MROUND(1E308,1E-308)')).toBe(1e308);
  });

  it('BUG-369/370/371/383/439 enforces combinatorial input and factorial limits', () => {
    expect(evaluate('=BASE(9007199254740990,2)')).toHaveLength(53);
    expect(evaluate('=BASE(9007199254740992,16)')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=ISERROR(BASE(9007199254740992,2))')).toBe(true);
    expect(evaluate('=ISERROR(BASE(9007199254740991,2))')).toBe(false);
    for (const number of ['9007199254741000', '1E20']) {
      expect(evaluate(`=BASE(${number},16)`)).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    }
    for (const name of ['COMBIN', 'COMBINA']) {
      const overLimit = name === 'COMBIN' ? 2147483647 : 2147483648;
      expect(evaluate(`=${name}(2147483648,1)`)).toEqual(overLimit);
      expect(evaluate(`=${name}(2147483648,0)`)).toBe(1);
      expect(evaluate(`=${name}(9007199254741000,1)`)).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
      expect(evaluate(`=${name}(-0.1,0)`)).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
      expect(evaluate(`=${name}(5,-0.1)`)).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    }
    expect(evaluate('=PERMUT(2147483648,1)')).toBe(2147483647);
    expect(evaluate('=PERMUT(3000000000,1)')).toBe(2147483647);
    expect((evaluate('=PERMUT(1000000000000,3)') as number) / 9.90352028661293e27).toBeCloseTo(1, 12);
    expect(evaluate('=PERMUT(9007199254741000,1)')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=MULTINOMIAL(169,1)')).toBe(170);
    expect(evaluate('=MULTINOMIAL(170,0)')).toBe(1);
    expect(evaluate('=MULTINOMIAL(170,1)')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=MULTINOMIAL(171,0)')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=MULTINOMIAL(100,100)')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
  });

  it('BUG-1023 limits MULTINOMIAL by the factorial of the truncated sum', () => {
    const numberError = { kind: 'error', code: FormulaErrorCode.Number };
    expect(evaluate('=MULTINOMIAL(170)')).toBe(1);
    expect(evaluate('=MULTINOMIAL(171)')).toEqual(numberError);
    expect(evaluate('=MULTINOMIAL(3,"2024-02-29",5)')).toEqual(numberError);
    expect(evaluate('=MULTINOMIAL(45000,4,5)')).toEqual(numberError);
    expect(evaluate('=MULTINOMIAL(1E12,0)')).toEqual(numberError);
    expect(evaluate('=MULTINOMIAL(A1,1)', { '0,0': 169 })).toBe(170);
    expect(evaluate('=MULTINOMIAL(A1,1)', { '0,0': 170 })).toEqual(numberError);
    expect(evaluate('=MULTINOMIAL(A1,1)', { '0,0': 168 })).toBe(169);
    expect(evaluate('=MULTINOMIAL(A1,1)', { '0,0': '2024-02-29' })).toBe(1);
  });

  it('BUG-403/527 computes finite products after cancellation', () => {
    expect(evaluate('=MMULT({1E308,1E308},{2;-2})')).toBe(0);
    expect(evaluate('=SUMPRODUCT({1E308,1E308},{2,-2})'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=PRODUCT(1E308,2,0)')).toBe(0);
    expect(evaluate('=PRODUCT(0,1E308,2)')).toBe(0);
    expect(evaluate('=PRODUCT(1E308,0,2)')).toBe(0);
    expect(evaluate('=PRODUCT(1E308,2,0.5)')).toBe(1e308);
  });

  it('BUG-981 preserves exactly representable integer products', () => {
    expect(evaluate('=PRODUCT(2,3,-59,5)')).toBe(-1770);
    expect(evaluate('=PRODUCT(2,2.675,4,5)')).toBe(107);
    expect(evaluate('=PRODUCT(2,3,59,5)')).toBe(1770);
    expect(evaluate('=PRODUCT(2,3,61,5)')).toBe(1830);
    expect(evaluate('=PRODUCT(2,3,4,5,A1)', { '0,0': 45000 })).toBe(5400000);
    expect(evaluate('=PRODUCT(1E308,2,0.5)')).toBe(1e308);
  });

  it('BUG-513/537/675/706/707 validates Roman text and extreme arithmetic', () => {
    for (const roman of ['IC', 'VX']) {
      expect(evaluate(`=ARABIC("${roman}")`)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    }
    for (const [number, divisor] of [[1e308, 1e-308], [1e307, 1e-307]]) {
      const remainder = evaluate(`=MOD(${number},${divisor})`) as number;
      expect(remainder).toBeGreaterThanOrEqual(0);
      expect(remainder).toBeLessThan(divisor);
    }
    expect(evaluate('=MOD(-1E-320,1E308)')).toBe(1e308);
    expect(evaluate('=MOD(1E-320,-1E308)')).toBe(-1e308);
    for (const [number, expected] of [[6.05, 6.1], [1.15, 1.2], [5.05, 5.1], [10.05, 10.1]])
      expect(evaluate(`=MROUND(${number},0.1)`)).toBeCloseTo(expected, 10);
    expect(evaluate('=QUOTIENT(1E308,1E-308)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=QUOTIENT(1E308,2)')).toBe(5e307);
  });

  it('BUG-511/512/529/530/704 reports argument errors and consistent aggregates', () => {
    for (const formula of ['=DECIMAL("101")', '=DECIMAL("101",2,3)', '=COMBINA(4)',
      '=COMBINA(4,2,1)', '=MUNIT()', '=MUNIT(1,2)']) {
      expect(evaluate(formula)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    }
    expect(evaluate('=LCM(A1,6)', { '0,0': '-2' })).toBe(6);
    expect(evaluate('=LCM(A1:A3)', { '0,0': 6, '1,0': '8', '2,0': 9 })).toBe(18);
    expect(evaluate('=SUBTOTAL(6,M25:M26)')).toBe(0);
    expect(evaluate('=AGGREGATE(6,0,M25:M26)')).toBe(0);
    for (const [functionNumber, expected] of [[14, 4], [15, 1], [17, 1.75]]) {
      expect(evaluate(`=AGGREGATE(${functionNumber},0,{1,2,3,4},1.5)`)).toBe(expected);
    }
  });

  it('BUG-528 excludes filtered rows even when the subtotal includes manually hidden rows', () => {
    const context = createContext({ '0,0': 1, '1,0': 2, '2,0': 3 }, [3, 1]);
    context.iterateRangeCells = function* iterateFilteredRangeCells(startRow, startColumn, endRow, endColumn) {
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startColumn; col <= endColumn; col++) {
          yield { row, col, value: context.getCellValue(row, col), source: 'value' as const,
            filtered: row === 1 };
        }
      }
    };
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
    const parser = new FormulaParser();
    expect(evaluator.evaluate(parser.parse('=SUBTOTAL(9,A1:A3)'), context)).toBe(4);
    expect(evaluator.evaluate(parser.parse('=AGGREGATE(9,1,A1:A3)'), context)).toBe(4);
  });

  it('BUG-315/316/535/1014 handles zero powers and invalid or cancelling coefficients', () => {
    expect(evaluate('=SERIESSUM(0,0,1,1)')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=SERIESSUM(0,0,1,{1,2,3})')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=SERIESSUM("0",0,1,{1,2,3})')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=SERIESSUM(0,1,1,{1,2,3})')).toBe(0);
    expect(evaluate('=SERIESSUM(0,0,0,{1,-1})')).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=SERIESSUM(2,0,1,UPPER(" a "))')).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=SERIESSUM(2,1024,0,{1,-1})')).toBe(0);
  });

  it('BUG-531 rejects negative integer AGGREGATE options', () => {
    expect(evaluate('=AGGREGATE(9,-1,{1,2})'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('BUG-993 accepts tiny negative AGGREGATE options that round to zero', () => {
    expect(evaluate('=AGGREGATE(9,-0.000000000001,{1,2,3})')).toBe(6);
    expect(evaluate('=AGGREGATE(9,-0.0000000000001,{1,2})')).toBe(3);
    expect(evaluate('=AGGREGATE(9,-1,{1,2})'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('BUG-1008 rejects a half-negative AGGREGATE option from literals and references', () => {
    const invalid = { kind: 'error', code: FormulaErrorCode.Value };
    expect(evaluate('=AGGREGATE(9,-0.5,{1,2})')).toEqual(invalid);
    expect(evaluate('=AGGREGATE(9,A1,{1,2})', { '0,0': -0.5 })).toEqual(invalid);
    expect(evaluate('=AGGREGATE(9,IF(TRUE,A1,0),{1,2})', { '0,0': -0.5 })).toEqual(invalid);
    expect(evaluate('=AGGREGATE(9,-1e-12,{1,2})')).toBe(3);
    expect(evaluate('=AGGREGATE(9,A1,{1,2})', { '0,0': 0 })).toBe(3);
  });

  it('BUG-718 rejects random ranges whose widths overflow', () => {
    expect(evaluate('=RANDBETWEEN(-1E308,1E308)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=INDEX(RANDARRAY(1,1,-1E308,1E308),1,1)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
  });

  it('BUG-317/318 retains tiny nonzero matrix values', () => {
    expect(evaluate('=MDETERM({0.0000000000001})')).toBeCloseTo(1e-13, 25);
    expect(evaluate('=MINVERSE({0.0000000000001})')).toEqual([[1e13]]);
    expect(evaluate('=MINVERSE({1,0.0000000000001;0,1})'))
      .toEqual([[1, -1e-13], [0, 1]]);
  });

  it('BUG-321 rounds only true midpoints to even', () => {
    expect(evaluate('=ROUNDBANK(2.5000000000001,0)')).toBe(3);
    expect(evaluate('=ROUNDBANK(3.4999999999999,0)')).toBe(3);
    expect(evaluate('=ROUNDBANK(2.5,0)')).toBe(2);
  });

  it('BUG-325/326 keeps small inverse hyperbolic results', () => {
    expect(evaluate('=ASINH(1E200)')).toBeCloseTo(Math.asinh(1e200), 12);
    expect(evaluate('=ASINH(1E-17)')).toBe(1e-17);
    expect(evaluate('=ACOTH(1E17)')).toBeCloseTo(1e-17, 28);
  });

  it('BUG-327/329/538 avoids overflow in finite conversions', () => {
    expect(evaluate('=SQRTPI(9E307)')).toBeCloseTo(Math.sqrt(9e307) * Math.sqrt(Math.PI), -140);
    expect(evaluate('=RADIANS(9E307)')).toBeCloseTo(9e307 * (Math.PI / 180), -290);
    expect(evaluate('=RADIANS(1E308)')).toBeCloseTo(1e308 * (Math.PI / 180), -290);
    expect(evaluate('=DEGREES(1E306)')).toBeCloseTo(1e306 * (180 / Math.PI), -290);
  });
});
