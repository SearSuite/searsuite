/** @jest-environment node */

import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { FunctionRegistry } from '../src/functions';
import {
  FormulaErrorCode,
  type ErrorCode,
  type EvalContext,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import cases from '@searsuite-test/formula-coverage-cases';
import markdownCases from './fixtures/financial-source-cases.json';

const financialNames = new Set([
  'ACCRINT',
  'ACCRINTM',
  'AMORDEGRC',
  'AMORLINC',
  'COUPDAYBS',
  'COUPDAYS',
  'COUPDAYSNC',
  'COUPNCD',
  'COUPNUM',
  'COUPPCD',
  'CUMIPMT',
  'CUMPRINC',
  'DB',
  'DDB',
  'DISC',
  'DOLLARDE',
  'DOLLARFR',
  'DURATION',
  'EFFECT',
  'FV',
  'FVSCHEDULE',
  'INTRATE',
  'IPMT',
  'IRR',
  'ISPMT',
  'MDURATION',
  'MIRR',
  'NOMINAL',
  'NPER',
  'NPV',
  'ODDFPRICE',
  'ODDFYIELD',
  'ODDLPRICE',
  'ODDLYIELD',
  'PDURATION',
  'PMT',
  'PPMT',
  'PRICE',
  'PRICEDISC',
  'PRICEMAT',
  'PV',
  'RATE',
  'RECEIVED',
  'RRI',
  'SLN',
  'SYD',
  'TBILLEQ',
  'TBILLPRICE',
  'TBILLYIELD',
  'VDB',
  'XIRR',
  'XNPV',
  'YIELD',
  'YIELDDISC',
  'YIELDMAT',
]);

const context: EvalContext = {
  isCellInBounds: (row, column) => row >= 0 && row < 10_000 && column >= 0 && column < 4,
  getSheetShape: () => [10_000, 4],
  getCellValue: (row, column) => (column === 0 ? (row === 0 ? -1000 : (row % 100) + 10) : row + column + 1),
  *iterateRange(startRow, startColumn, endRow, endColumn): Iterable<FormulaValue> {
    for (let row = startRow; row <= endRow; row++) {
      for (let column = startColumn; column <= endColumn; column++) yield context.getCellValue(row, column);
    }
  },
};

function evaluate(formula: string, evaluationContext: EvalContext = context): FormulaValue {
  return new FormulaEvaluator(new FunctionRegistry(), new AggregationCache()).evaluate(
    new FormulaParser().parse(formula),
    evaluationContext,
  );
}

function expectNumber(formula: string): number {
  const result = evaluate(formula);
  expect(typeof result).toBe('number');
  expect(Number.isFinite(result as number)).toBe(true);
  return result as number;
}

function expectError(formula: string, code?: ErrorCode): void {
  const result = evaluate(formula);
  expect(result).toEqual(expect.objectContaining({ kind: 'error' }));
  if (code) expect((result as { readonly code: ErrorCode }).code).toBe(code);
}

describe('financial formula coverage', () => {
  const sourceCases = cases.filter(({ name }) => financialNames.has(name));

  it('distinguishes boolean date references from literals in odd bonds and PRICEMAT', () => {
    const booleanContext: EvalContext = { ...context, getCellValue: () => true };
    for (const name of ['ODDFPRICE', 'ODDFYIELD']) {
      const suffix = name === 'ODDFPRICE'
        ? 'DATE(2029,1,1),DATE(2023,7,1),DATE(2024,4,1),0.06,0.05,100,2,0)'
        : 'DATE(2029,1,1),DATE(2023,7,1),DATE(2024,4,1),0.06,95,100,2,0)';
      expect(evaluate(`=${name}(TRUE,${suffix}`)).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
      expect(evaluate(`=${name}(A1,${suffix}`, booleanContext))
        .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
      expect(evaluate(`=${name}(IF(TRUE,A1,0),${suffix}`, booleanContext))
        .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    }
    expect(evaluate('=PRICEMAT(TRUE,DATE(2025,1,1),DATE(2023,1,1),0.06,0.05,0)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=PRICEMAT(A1,DATE(2025,1,1),DATE(2023,1,1),0.06,0.05,0)', booleanContext))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('coerces referenced numeric date text before validating XIRR and XNPV array shape', () => {
    const dateContext: EvalContext = {
      ...context,
      getCellValue: () => ({ kind: 'text', value: '1', numericCoercion: 'allow' }),
    };
    expect(evaluate('=XIRR({-1000,300,400,500},A1)', dateContext))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=XNPV(0.1,{-1000,300,400,500},A1)', dateContext))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expectError('=XNPV(0.1,{-1000,300,400,500},"1")', FormulaErrorCode.Value);
  });

  it('returns the WPS length error for text within XNPV input ranges', () => {
    const cells: Record<string, string | number> = {
      '1,0': -100000, '2,0': 27500, '3,0': 42500, '4,0': 32500, '5,0': 27500,
      '1,1': '2008-1-1', '2,1': '2008-3-1', '3,1': '2008-10-30',
      '4,1': '2009-2-15', '5,1': '2009-4-1',
    };
    const rangeContext: EvalContext = {
      ...context,
      getCellValue: (row, col) => cells[`${row},${col}`] ?? null,
      *iterateRange(startRow, startCol, endRow, endCol) {
        for (let row = startRow; row <= endRow; row++) {
          for (let col = startCol; col <= endCol; col++) yield cells[`${row},${col}`] ?? null;
        }
      },
    };
    expect(evaluate('=XNPV(.09,A2:A6,B2:B6)', rangeContext))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    cells['1,1'] = 39448;
    cells['2,1'] = 39508;
    cells['3,1'] = 39750;
    cells['4,1'] = 39859;
    cells['5,1'] = 39904;
    expect(evaluate('=XNPV(.09,A2:A6,B2:B6)', rangeContext)).toEqual(expect.any(Number));
    cells['1,0'] = '-￥100,000';
    expect(evaluate('=XNPV(.09,A2:A6,B2:B6)', rangeContext))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
  });

  it('uses WPS date error precedence for referenced XIRR booleans and XNPV text', () => {
    const booleanContext: EvalContext = { ...context, getCellValue: () => false };
    const textContext: EvalContext = {
      ...context,
      getCellValue: () => ({ kind: 'text', value: '汉字', numericCoercion: 'deny' }),
    };
    expect(evaluate('=XIRR({-1000,300,400,500},FALSE)'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=XIRR({-1000,300,400,500},A1)', booleanContext))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=XNPV(0.1,{-1000,300,400,500},"汉字")'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=XNPV(0.1,{-1000,300,400,500},A1)', textContext))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
  });

  it('rejects nonpositive nominal rates for EFFECT', () => {
    expectError('=EFFECT(0,12)', FormulaErrorCode.Number);
    expectError('=EFFECT(-1,12)', FormulaErrorCode.Number);
    expectError('=NOMINAL(0,12)', FormulaErrorCode.Number);
    expectError('=NOMINAL(-0.5,12)', FormulaErrorCode.Number);
    expect(expectNumber('=EFFECT(0.08,12)')).toBeCloseTo(0.0829995, 6);
  });

  it('validates discounted-security price inputs', () => {
    expectError('=PRICEDISC(DATE(2024,1,1),DATE(2024,7,1),-0.05,100,0)', FormulaErrorCode.Number);
    expectError('=PRICEDISC(DATE(2024,1,1),DATE(2024,7,1),0.05,-10,0)', FormulaErrorCode.Number);
    expectError('=PRICEDISC(DATE(2024,1,1),DATE(2024,7,1),0,100,0)', FormulaErrorCode.Number);
  });

  it('rejects nonpositive discount rates for discounted securities', () => {
    for (const [name, extra] of [
      ['TBILLPRICE', ''],
      ['TBILLEQ', ''],
      ['RECEIVED', '100,'],
      ['PRICEDISC', ''],
    ]) {
      const formula = (discount: number) => `=${name}(DATE(2024,1,1),DATE(2024,7,1),${extra}${discount})`;
      expectError(formula(0), FormulaErrorCode.Number);
      expectError(formula(-0.01), FormulaErrorCode.Number);
      expect(expectNumber(formula(0.000001))).toBeGreaterThan(0);
    }
  });

  it('BUG-1038 rounds the cumulative start period up and the end period down', () => {
    expect(expectNumber('=CUMIPMT(0.1,3,100,1.5,2.5,0)'))
      .toBeCloseTo(expectNumber('=CUMIPMT(0.1,3,100,2,2,0)'), 12);
    expect(expectNumber('=CUMPRINC(0.1,3,100,1.5,2.5,0)'))
      .toBeCloseTo(expectNumber('=CUMPRINC(0.1,3,100,2,2,0)'), 12);
    expectError('=CUMIPMT(0.1,3,100,0.9,2,0)', FormulaErrorCode.Number);
    expect(expectNumber('=CUMIPMT(0.08/12,60,5000,1.8751,12,0)')).toBeCloseTo(-336.0498136793186, 8);
    expect(expectNumber('=CUMPRINC(0.08/12,60,5000,1.8751,12,0)')).toBeCloseTo(-779.1518721834337, 8);
    expect(expectNumber('=CUMIPMT(0.08/12,60,5000,2.1253,12,0)')).toBeCloseTo(-303.1701379333771, 8);
    expect(expectNumber('=CUMPRINC(0.08/12,60,5000,2.1253,12,0)')).toBeCloseTo(-710.649576487307, 8);
  });

  it('rejects nonpositive RECEIVED investments', () => {
    expectError('=RECEIVED(DATE(2024,1,1),DATE(2024,7,1),0,0.05)', FormulaErrorCode.Number);
    expectError('=RECEIVED(DATE(2024,1,1),DATE(2024,7,1),-100,0.05)', FormulaErrorCode.Number);
    expect(expectNumber('=RECEIVED(DATE(2024,1,1),DATE(2024,7,1),100,0.05)'))
      .toBeCloseTo(102.56410256410257, 10);
  });

  it('rejects nonpositive INTRATE redemptions', () => {
    expectError('=INTRATE(DATE(2024,1,1),DATE(2024,7,1),100,0)', FormulaErrorCode.Number);
    expectError('=INTRATE(DATE(2024,1,1),DATE(2024,7,1),100,-1)', FormulaErrorCode.Number);
    expect(expectNumber('=INTRATE(DATE(2024,1,1),DATE(2024,7,1),100,110)')).toBeCloseTo(0.2, 12);
  });

  it('avoids overflow in PDURATION value ratios', () => {
    expect(expectNumber('=PDURATION(0.1,1E-300,1E300)')).toBeCloseTo(14495.3147568581, 8);
    expect(expectNumber('=PDURATION(0.1,1,2)')).toBeCloseTo(7.272540897341713, 12);
  });

  it('keeps a finite PDURATION for very small positive rates', () => {
    const periods = expectNumber('=PDURATION(1E-17,1,2)');
    expect(Number.isFinite(periods)).toBe(true);
    expect(Math.abs(periods / 6.931471805599452e16 - 1)).toBeLessThan(1e-14);
    expect(expectNumber('=PDURATION(0.1,1,2)')).toBeCloseTo(7.272540897341713, 12);
  });

  it('avoids overflow in RRI investment ratios', () => {
    expect(expectNumber('=RRI(1000,1E-300,1E300)')).toBeCloseTo(2.981071705535, 10);
    expect(expectNumber('=RRI(1000,1,2)')).toBeCloseTo(0.0006933874626, 12);
  });

  it('preserves tiny rates and high compounding counts in EFFECT and NOMINAL', () => {
    for (const formula of ['=EFFECT(1E-17,12)', '=NOMINAL(1E-17,12)']) {
      const result = expectNumber(formula);
      expect(result).toBeGreaterThan(0);
      expect(Math.abs(result / 1e-17 - 1)).toBeLessThan(1e-14);
    }
    expect(expectNumber('=EFFECT(1E-12,12)')).toBeCloseTo(1e-12, 15);
    expect(expectNumber('=NOMINAL(1E-12,12)')).toBeCloseTo(1e-12, 15);
    expect(expectNumber('=NOMINAL(1,1E12)')).toBeCloseTo(Math.log(2), 12);
    expect(expectNumber('=EFFECT(1,1E12)')).toBeCloseTo(Math.E - 1, 11);
  });

  it('keeps an exact integer EFFECT result for integral compounding growth', () => {
    expect(evaluate('=EFFECT(60,12)')).toBe(2176782335);
    expect(evaluate('=EFFECT(A1,12)', { ...context, getCellValue: () => 60 })).toBe(2176782335);
    expect(expectNumber('=EFFECT(1E-17,12)')).toBeGreaterThan(0);
  });

  it('reads eight-argument odd-last bond price and yield positions', () => {
    expect(evaluate('=ODDLPRICE(39485,39614,39370,0.0375,0.0405,100,2,0)'))
      .toBeCloseTo(99.8782860147213, 10);
    expect(evaluate('=ODDLYIELD(39558,39614,39440,0.0375,998.75,100,2,0)'))
      .toBeCloseTo(-5.87922224032062, 10);
    expect(evaluate('=ODDLYIELD(39558,39614,39440,0.0375,"￥998.75",100,2,0)'))
      .toBeCloseTo(-5.87922224032062, 10);
  });

  it('rejects treasury bill discounts that produce a nonpositive price', () => {
    expect(expectNumber('=TBILLPRICE(DATE(2024,1,1),DATE(2024,7,1),0.05)')).toBeGreaterThan(0);
    expectError('=TBILLPRICE(DATE(2024,1,1),DATE(2024,7,1),2.675)', FormulaErrorCode.Number);
    expect(expectNumber('=TBILLEQ(DATE(2024,1,1),DATE(2024,7,1),1)')).toBeCloseTo(2.050561797752809, 12);
  });

  it('applies WPS date error and cardinality rules to irregular cash flows', () => {
    const referenceError = { kind: 'error' as const, code: FormulaErrorCode.Reference };
    const errorContext = {
      ...context,
      getCellValue: () => referenceError,
      *iterateRange() { yield referenceError; },
    };
    expect(evaluate('=XIRR({-1000,300,400,500},A1)', errorContext))
      .toEqual(referenceError);
    expect(evaluate('=XNPV(0.1,{-1000,300,400,500},A1)', errorContext))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    const divisionError = { kind: 'error' as const, code: FormulaErrorCode.DivisionByZero };
    const divisionContext = {
      ...errorContext,
      getCellValue: () => divisionError,
      *iterateRange() { yield divisionError; },
    };
    expect(evaluate('=XIRR({-100,110},A1)', divisionContext))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=XNPV(0.1,{-100,110},A1)', divisionContext)).toEqual(divisionError);
    const unavailableError = { kind: 'error' as const, code: FormulaErrorCode.NotAvailable };
    const unavailableContext = {
      ...errorContext,
      getCellValue: () => unavailableError,
      *iterateRange() { yield unavailableError; },
    };
    expect(evaluate('=XIRR({-1000,300,400,500},IF(TRUE,A1,0))', unavailableContext))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    const nameError = { kind: 'error' as const, code: FormulaErrorCode.Name };
    const nameContext = {
      ...errorContext,
      getCellValue: () => nameError,
      *iterateRange() { yield nameError; },
    };
    expect(evaluate('=XNPV(0.1,{-1000,300,400,500},IF(TRUE,A1,0))', nameContext))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(evaluate('=XNPV(0.1,{-1000,300,400,500},{1,2,3,A1})', nameContext))
      .toEqual(nameError);
    expectError('=XIRR({-1000,300,400,500},"1")', FormulaErrorCode.Value);
    expectError('=XNPV(0.1,{-1000,300,400,500},"1.5")', FormulaErrorCode.Value);
  });

  it('handles MIRR empty input and singular finance rates', () => {
    expectError('=MIRR("",0.08,0.1)', FormulaErrorCode.Value);
    expectError('=MIRR({-1000,300,400,500},-1,0.1)', FormulaErrorCode.DivisionByZero);
    expect(evaluate('=MIRR({-1000,300,400,500},IF(TRUE,A1,0),0.1)', {
      ...context,
      getCellValue: () => -1,
    })).toEqual({ kind: 'error', code: FormulaErrorCode.DivisionByZero });
    expect(evaluate('=MIRR({-1000,300,400,500},IF(TRUE,A1,0),0.1)', {
      ...context,
      getCellValue: () => '-1',
    })).toEqual({ kind: 'error', code: FormulaErrorCode.DivisionByZero });
    expectError('=MIRR({-100,120,-10},-1,0.1)', FormulaErrorCode.DivisionByZero);
    expect(expectNumber('=MIRR({-1000,300,400,500},-0.5,0.1)')).toBeCloseTo(0.0922317710801408, 12);
  });

  it('BUG-205 treats a singular finance rate consistently across argument sources', () => {
    expectError('=MIRR({-100;120},-1,0.1)', FormulaErrorCode.DivisionByZero);
    expectError('=MIRR({-100;120},SUM(-1,0),0.1)', FormulaErrorCode.DivisionByZero);
  });

  it('BUG-207 preserves a referenced cash-flow error in IRR', () => {
    const broken = { kind: 'error', code: FormulaErrorCode.DivisionByZero } as const;
    const cashFlows: FormulaValue[] = [-100, broken, 120];
    const errorContext: EvalContext = {
      ...context,
      getCellValue: (row) => cashFlows[row] ?? null,
      *iterateRange(startRow, _startCol, endRow): Iterable<FormulaValue> {
        for (let row = startRow; row <= endRow; row++) yield cashFlows[row] ?? null;
      },
    };
    expect(evaluate('=IRR(A1:A3)', errorContext)).toEqual(broken);
    expect(evaluate('=NPV(0.1,A1:A3)', errorContext)).toEqual(broken);
  });

  it('IRR reports a value error when referenced cash flows lack both signs', () => {
    const broken = { kind: 'error' as const, code: FormulaErrorCode.DivisionByZero };
    let cashFlows: FormulaValue[] = [broken, 1, 2];
    const errorContext: EvalContext = {
      ...context,
      getCellValue: (row) => cashFlows[row] ?? null,
      *iterateRange(startRow, _startCol, endRow): Iterable<FormulaValue> {
        for (let row = startRow; row <= endRow; row++) yield cashFlows[row] ?? null;
      },
    };
    const valueError = { kind: 'error', code: FormulaErrorCode.Value };
    expect(evaluate('=IRR(A1)', errorContext)).toEqual(valueError);
    expect(evaluate('=IRR(IF(TRUE,A1,0))', errorContext)).toEqual(valueError);
    expect(evaluate('=IRR(A1:A3)', errorContext)).toEqual(valueError);
    expect(evaluate('=NPV(0.1,A1:A3)', errorContext)).toEqual(broken);
    cashFlows = [broken, -100, 120];
    expect(evaluate('=IRR(A1:A3)', errorContext)).toEqual(broken);
    cashFlows = [-100, 0, 120];
    expect(evaluate('=IRR(A1:A3)', errorContext)).toBeCloseTo(Math.sqrt(1.2) - 1, 9);
  });

  it('BUG-213 reports zero straight-line life as division by zero', () => {
    expectError('=SLN(100,0,0)', FormulaErrorCode.DivisionByZero);
    expectError('=SYD(100,0,0,1)', FormulaErrorCode.Number);
    expect(expectNumber('=SLN(100,0,5)')).toBe(20);
  });

  it('BUG-206 and BUG-1051 reject duration bases above 4 in WPS', () => {
    const formula = '=DURATION(DATE(2024,1,1),DATE(2029,1,1),0.06,0.05,2,4.1255)';
    expectError(formula, FormulaErrorCode.Number);
    const overLimitContext = { ...context, getCellValue: () => 4.1255 };
    expect(evaluate('=DURATION(DATE(2024,1,1),DATE(2029,1,1),0.06,0.05,2,A1)', overLimitContext))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    for (const functionName of ['DURATION', 'MDURATION']) {
      const base = `${functionName}(DATE(2024,1,1),DATE(2025,1,1),0.05,0.06,2,`;
      expect(evaluate(`=${base}A1)`, { ...context, getCellValue: () => 4.5 }))
        .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
      expect(evaluate(`=${base}IF(TRUE,A1,0))`, { ...context, getCellValue: () => 4.5 }))
        .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
      expectError(`=${base}4.5)`, FormulaErrorCode.Number);
      expect(evaluate(`=${base}A1)`, { ...context, getCellValue: () => 3.6251 }))
        .toBeCloseTo(expectNumber(`=${base}3.6251)`), 12);
    }
  });

  it('finds negative odd-first yields for low redemption values', () => {
    expect(evaluate('=ODDFYIELD(DATE(2024,1,1),DATE(2029,1,1),DATE(2023,7,1),DATE(2024,4,1),0.06,95,10,2,0)'))
      .toBeCloseTo(-0.209563358074513, 9);
    expectError('=ODDFPRICE(DATE(2024,1,1),DATE(2029,1,1),DATE(2023,7,1),DATE(2024,4,1),0.06,-0.2,100,2,0)',
      FormulaErrorCode.Number);
    expectError('=YIELDDISC(DATE(2024,1,1),DATE(2024,7,1),97,-10,0)', FormulaErrorCode.Number);
  });

  it('keeps WPS coupon-yield convergence bounds separate from zero-coupon yields', () => {
    const base = 'DATE(2024,1,1),DATE(2029,1,1),';
    expect(expectNumber(`=YIELD(${base}2.1253,100,100,2,0)`)).toBeCloseTo(2.1253, 10);
    expectError(`=YIELD(${base}2.3755,100,100,2,0)`, FormulaErrorCode.Number);
    expectError(`=YIELD(${base}2.625,100,100,2,0)`, FormulaErrorCode.Number);
    expect(expectNumber('=YIELD(DATE(2020,1,1),DATE(2021,1,1),0,0.00001,100,1,0)'))
      .toBeCloseTo(9999999, 3);
  });

  it('accepts omitted basis for odd coupon prices', () => {
    expectError('=ODDFPRICE(DATE(2029,1,1),DATE(2023,7,1),DATE(2024,4,1),0.06,0.05,100,2,0)',
      FormulaErrorCode.Number);
    expect(evaluate('=ODDFPRICE(DATE(2024,1,1),DATE(2029,1,1),DATE(2023,7,1),DATE(2024,4,1),0.06,0.05,100,2)'))
      .toEqual(evaluate('=ODDFPRICE(DATE(2024,1,1),DATE(2029,1,1),DATE(2023,7,1),DATE(2024,4,1),0.06,0.05,100,2,0)'));
  });

  it('reads formatted amount and date text in XIRR schedules', () => {
    const rows: FormulaValue[][] = [
      ['-10,000', '2008-1-1'], ['2,750', '2008-3-1'], ['4,250', '2008-10-30'],
      ['3,250', '2009-2-15'], ['2,750', '2009-4-1'],
    ];
    const dateContext: EvalContext = {
      ...context,
      getCellValue: (row, col) => rows[row - 2]?.[col] ?? null,
      *iterateRange(startRow, startCol, endRow, endCol): Iterable<FormulaValue> {
        for (let row = startRow; row <= endRow; row++) {
          for (let col = startCol; col <= endCol; col++) yield rows[row - 2]?.[col] ?? null;
        }
      },
    };
    const result = evaluate('=XIRR(A3:A7,B3:B7,0.1)', dateContext);
    expect(typeof result).toBe('number');
    expect(result).toBeCloseTo(0.373362533518832, 12);
  });

  it('rejects coupon rates beyond the odd-yield search range', () => {
    expectError('=ODDFYIELD(DATE(2024,1,1),DATE(2029,1,1),DATE(2023,7,1),DATE(2024,4,1),"2024-02-29",95,100,2,0)',
      FormulaErrorCode.Number);
    expect(expectNumber('=ODDFYIELD(DATE(2024,1,1),DATE(2029,1,1),DATE(2023,7,1),DATE(2024,4,1),5.8755,95,100,2,0)'))
      .toBeGreaterThan(0);
  });

  it('retains small first-period principal payments with large negative-rate growth', () => {
    expect(expectNumber('=PPMT(-4.5001,1,60,5000)')).toBeCloseTo(5.09759131020273e-29, 35);
    expect(expectNumber('=PPMT(-5.25,1,60,5000)')).toBeCloseTo(5.19748811274775e-34, 39);
  });

  it('executes every financial formula from 财务.md', () => {
    expect(sourceCases).toHaveLength(55);
    for (const { formula } of sourceCases) expectNumber(formula);
  });

  it('keeps every source markdown example as an executable or documented syntax case', () => {
    expect(markdownCases).toHaveLength(88);
    let parsed = 0;
    for (const { formula, expected } of markdownCases) {
      expect(expected.length).toBeGreaterThan(0);
      try {
        const result = evaluate(formula);
        expect(result).toBeDefined();
        parsed++;
      } catch {
        // Two source rows intentionally preserve Excel's full-width punctuation examples.
        expect(formula).toMatch(/[，、]/u);
      }
    }
    expect(parsed).toBeGreaterThanOrEqual(86);
  });

  it('preserves common annuity identities', () => {
    const payment = expectNumber('=PMT(0.08/12,60,5000)');
    expect(expectNumber('=PV(0.08/12,60,' + payment + ')')).toBeCloseTo(5000, 7);
    expect(expectNumber('=FV(0.08/12,60,' + payment + ',5000)')).toBeCloseTo(0, 7);
    const principal = expectNumber('=PPMT(0.08/12,1,60,5000)');
    const interest = expectNumber('=IPMT(0.08/12,1,60,5000)');
    expect(principal + interest).toBeCloseTo(payment, 10);
    expect(expectNumber('=NPER(0.08/12,-100,5000)')).toBeCloseTo(61.022274, 5);
    expect(expectNumber('=CUMPRINC(0.08/12,60,5000,1,60,0)')).toBeCloseTo(-5000, 5);
  });

  it('BUG-347 keeps PMT finite for a very small nonzero rate', () => {
    expect(expectNumber('=PMT(1E-17,12,100)')).toBeCloseTo(-100 / 12, 12);
    expect(expectNumber('=PMT(0,12,100)')).toBeCloseTo(-100 / 12, 12);
    expect(expectNumber('=PMT(0.1,2,100)')).toBeCloseTo(-57.6190476190476, 12);
  });

  it('BUG-348 keeps NPER finite for a very small nonzero rate', () => {
    expect(expectNumber('=NPER(1E-17,-1,100)')).toBeCloseTo(100, 11);
    expect(expectNumber('=NPER(0,-1,100)')).toBe(100);
    expect(expectNumber('=NPER(0.1,-20,100)')).toBeCloseTo(7.272540897341713, 10);
  });

  it('BUG-991 returns zero when an unrepresentably small period rounds away', () => {
    expect(evaluate('=NPER(0.08/12,-100,1E-12)')).toBe(0);
    expect(expectNumber('=NPER(1E-17,-1,100)')).toBeCloseTo(100, 11);
  });

  it('BUG-349 accumulates tiny interest over many FV periods', () => {
    expect(expectNumber('=FV(1E-17,1E17,0,-1)')).toBeCloseTo(Math.E, 12);
    expect(expectNumber('=FV(1E-17,1E17,-1,0)') / (1e17 * (Math.E - 1))).toBeCloseTo(1, 12);
    expect(expectNumber('=FV(0.1,2,-100,0,1)')).toBeCloseTo(231, 12);
  });

  it('BUG-350 preserves representable growth over many RRI periods', () => {
    const growth = expectNumber('=RRI(1000,1,1.0000000000001)');
    expect(growth).toBeGreaterThan(0);
    expect(growth * 1000).toBeCloseTo(expectNumber('=RRI(1,1,1.0000000000001)'), 24);
  });

  it('BUG-380 keeps IRR and XIRR invariant under cash-flow scaling', () => {
    for (const [negative, positive] of [
      ['-1E-20', '2E-20'], ['-1E-12', '2E-12'], ['-1', '2'], ['-1E20', '2E20'],
    ]) {
      expect(expectNumber(`=IRR({${negative};${positive}})`)).toBeCloseTo(1, 9);
      expect(expectNumber(`=XIRR({${negative};${positive}},{DATE(2024,1,1);DATE(2024,12,31)})`))
        .toBeCloseTo(1, 9);
    }
  });

  it('BUG-381 solves IRR and XIRR above the former million-rate limit', () => {
    expect(expectNumber('=IRR({-1;10000000},9000000)')).toBeCloseTo(9999999, 6);
    expect(expectNumber('=XIRR({-1;10000000},{DATE(2024,1,1);DATE(2024,12,31)},9000000)'))
      .toBeCloseTo(9999999, 6);
    expect(expectNumber('=IRR({-1;10000000;0},9000000)')).toBeCloseTo(9999999, 5);
    expect(expectNumber('=XIRR({-1;10000000;0},{DATE(2024,1,1);DATE(2024,12,31);DATE(2025,12,31)},9000000)'))
      .toBeCloseTo(9999999, 5);
    for (const future of [1000000, 1000001, 1000002]) {
      expect(expectNumber(`=IRR({-1;${future}},900000)`)).toBeCloseTo(future - 1, 8);
    }
    expect(expectNumber('=RATE(1,0,-1,10000000,0,9000000)')).toBe(9999999);
    expect(expectNumber('=XNPV(9999999,{-1;10000000},{DATE(2024,1,1);DATE(2024,12,31)})')).toBe(0);
  });

  it('BUG-408 solves one-period RATE without depending on the guess', () => {
    expect(expectNumber('=RATE(1,0,-1,1E100)')).toBe(1e100);
    expect(expectNumber('=RATE(1,0,-1,1E100,0,1E100)')).toBe(1e100);
    expect(expectNumber('=RATE(1,0,-100,110)')).toBeCloseTo(0.1, 12);
  });

  it('BUG-412 follows Excel and WPS zero-factor VDB switching', () => {
    expect(expectNumber('=VDB(1000,100,5,0,1,0)')).toBe(180);
    expect(expectNumber('=VDB(1000,100,5,0,1,0,TRUE)')).toBe(0);
    expect(expectNumber('=VDB(1000,100,5,0,1,1E-20)')).toBe(180);
  });

  it('BUG-413 preserves DB depreciation with salvage above cost', () => {
    expect(expectNumber('=DB(1000,2000,5,1)')).toBe(-149);
    expect(expectNumber('=DB(0,100,5,1)')).toBe(0);
    expect(expectNumber('=DB(1000,100,5,1)')).toBe(369);
  });

  it('BUG-414 inverts a high-yield zero-coupon bond price', () => {
    const price = expectNumber('=PRICE(DATE(2020,1,1),DATE(2021,1,1),0,10000000,100,1,0)');
    expect(price).toBeGreaterThan(0);
    const yieldFromPrice = expectNumber(`=YIELD(DATE(2020,1,1),DATE(2021,1,1),0,${price},100,1,0)`);
    expect(yieldFromPrice / 1e7).toBeCloseTo(1, 12);
    expect(expectNumber('=YIELD(DATE(2020,1,1),DATE(2021,1,1),0,0.00001,100,1,0)'))
      .toBeCloseTo(9999999, 5);
  });

  it('BUG-415 counts one coupon day after February month-end', () => {
    expect(expectNumber('=COUPDAYBS(DATE(2020,3,1),DATE(2020,8,31),2,0)')).toBe(1);
    expect(expectNumber('=COUPDAYBS(DATE(2021,3,1),DATE(2021,8,31),2,0)')).toBe(1);
  });

  it('uses valid FV payment types and fractional IPMT periods', () => {
    const beginningValue = expectNumber('=FV(0.08/12,60,-100,0,1)');
    expect(beginningValue).toBeCloseTo(7396.67019535424, 8);
    expect(expectNumber('=IPMT(0.08/12,1.005,60,5000)')).toBeCloseTo(-33.3310725353643, 10);
    expect(expectNumber('=PPMT(0.08/12,1.005,60,5000)')).toBeCloseTo(-68.0508989067049, 10);
  });

  it('matches WPS first-period annuity rounding across term, rate, and future-value boundaries', () => {
    expect(expectNumber('=IPMT(0.08/12,1,1.5,5000)')).toBeCloseTo(-33.3333333332876, 11);
    expect(expectNumber('=PPMT(0.08/12,1,1.5,5000)')).toBeCloseTo(-3327.79315862697, 10);
    for (const [periods, interest, principal] of [
      [1, -0.110611042514392, -5000],
      [2, 0.097291685662185, -2500.15259720442],
      [10, 0.00114622952906984, -500.012207329281],
      [60, 0.0000214923870487382, -83.335198338179],
    ]) {
      expect(expectNumber(`=IPMT(-1E-12,1,${periods},5000)`)).toBeCloseTo(interest, 12);
      expect(expectNumber(`=PPMT(-1E-12,1,${periods},5000)`)).toBeCloseTo(principal, 10);
    }
    expect(expectNumber('=PPMT(1E-12,1,60,5000)')).toBeCloseTo(-83.3258741486358, 10);
    expect(expectNumber('=IPMT(0.08/12,1,60,5000,-1E12)')).toBeCloseTo(-33.3333377838135, 8);
    for (const [rate, interest] of [
      ['1.6256', -8128],
      ['-1.75', 8750],
      ['-5.25', 26250],
    ] as const) expect(expectNumber(`=IPMT(${rate},1,60,5000)`)).toBe(interest);
  });

  it('BUG-181 treats nonzero FV payment timing as beginning and validates NPER timing', () => {
    for (const formula of [
      '=NPER(0,-100,1000,0,2)',
      '=NPER(0.1,-100,1000,0,0.5)',
    ]) expectError(formula, FormulaErrorCode.Number);
    expect(expectNumber('=FV(0.1,2,-100,0,1)')).toBeCloseTo(231);
    expect(expectNumber('=FV(0.1,2,-100,0,2)')).toBeCloseTo(231);
    expect(expectNumber('=FV(0.08/12,60,-100,0,-1)')).toBeCloseTo(7396.67019535424, 8);
    expect(expectNumber('=FV(0.08/12,60,-100,0,2.625)')).toBeCloseTo(7396.67019535424, 8);
    expect(expectNumber('=NPER(0,-100,1000,0,1)')).toBe(10);
  });

  it('BUG-204 follows WPS first-period payments at -100% independently of argument source', () => {
    const rateContext = { ...context, getCellValue: () => -1 };
    expect(evaluate('=IPMT(-1,1,60,5000)', rateContext)).toBe(0);
    expect(evaluate('=IPMT(A1,1,60,5000)', rateContext)).toBe(0);
    expect(evaluate('=IPMT(IF(TRUE,A1,0),1,60,5000)', rateContext)).toBe(0);
    expect(evaluate('=PPMT(-1,1,60,5000)', rateContext)).toBe(0);
    expect(evaluate('=PPMT(A1,1,60,5000)', rateContext)).toBe(0);
    expect(evaluate('=PPMT(IF(TRUE,A1,0),1,60,5000)', rateContext)).toBe(0);
  });

  it('handles negative payment periods and non-finite rate growth', () => {
    expect(expectNumber('=PMT(0.08/12,-61,5000)')).toBeCloseTo(66.6962780768794, 10);
    expectError('=PMT(-1e15,60,5000)', FormulaErrorCode.Number);
    expectError('=PMT(-2.675,60,5000)', FormulaErrorCode.Number);
    expectError('=PMT(0.08/12,0,5000)', FormulaErrorCode.Number);
    expect(expectNumber('=FV(0.08/12,-45000,-100,0,0)')).toBeCloseTo(-15000, 8);
    expectError('=FV(-1e15,60,-100,0,0)', FormulaErrorCode.Number);
    expectError('=NPER(-10,-100,5000)', FormulaErrorCode.Number);
  });

  it('validates cumulative loan inputs and excludes first-period interest for beginning payments', () => {
    expectError('=CUMIPMT(0,60,5000,1,12,0)', FormulaErrorCode.Number);
    expectError('=CUMPRINC(-0.01,60,5000,1,12,0)', FormulaErrorCode.Number);
    expectError('=CUMIPMT(0.08/12,60,0,1,12,0)', FormulaErrorCode.Number);
    expect(expectNumber('=CUMIPMT(0.08/12,60,5000,1,12,1)')).toBeCloseTo(-333.824318224489, 8);
    expect(expectNumber('=CUMPRINC(0.08/12,60,5000,1,12,1)')).toBeCloseTo(-874.702493667728, 8);
    expectError('=CUMIPMT(0.08/12,60,5000,1,12,1e-12)', FormulaErrorCode.Number);
    expect(expectNumber('=CUMIPMT(0.08/12,60,5000,1.8751,12,0)')).toBeCloseTo(-336.0498136793186, 8);
    expect(expectNumber('=CUMIPMT(10,60,5000,1,12,0)')).toBeCloseTo(-600000, 6);
    expect(expectNumber('=CUMIPMT(TRUE,60,5000,1,12,0)')).toBe(-60000);
    expect(expectNumber('=CUMPRINC(10,60,5000,1,12,0)')).toBeCloseTo(0, 8);
  });

  it('rejects invalid PRICEMAT date order and negative rates', () => {
    expectError('=PRICEMAT(DATE(2022,1,1),DATE(2025,1,1),DATE(2023,1,1),0.06,0.05,0)', FormulaErrorCode.Number);
    expectError('=PRICEMAT(DATE(2025,1,1),DATE(2025,1,1),DATE(2023,1,1),0.06,0.05,0)', FormulaErrorCode.Number);
    expectError('=PRICEMAT(DATE(2024,1,1),DATE(2025,1,1),DATE(2023,1,1),-0.01,0.05,0)', FormulaErrorCode.Number);
    expectError('=PRICEMAT(DATE(2024,1,1),DATE(2025,1,1),DATE(2023,1,1),0.06,-0.01,0)', FormulaErrorCode.Number);
  });

  it('prices PRICEMAT with actual days on its actual/actual basis', () => {
    expect(expectNumber('=PRICEMAT(DATE(2024,1,1),DATE(2025,1,1),DATE(2023,1,1),0.06,0.05,1)'))
      .toBeCloseTo(100.66840594834333, 11);
  });

  it('round-trips bond price and yield and cash-flow rates', () => {
    const price = expectNumber('=PRICE(DATE(2024,1,1),DATE(2029,1,1),0.06,0.05,100,2,0)');
    expect(expectNumber('=YIELD(DATE(2024,1,1),DATE(2029,1,1),0.06,' + price + ',100,2,0)')).toBeCloseTo(0.05, 7);
    const irr = expectNumber('=IRR({-1000,300,400,500})');
    expect(expectNumber('=NPV(' + irr + ',300,400,500)')).toBeCloseTo(1000, 5);
    const xirr = expectNumber(
      '=XIRR({-1000,300,400,500},{DATE(2024,1,1),DATE(2024,7,1),DATE(2025,1,1),DATE(2025,7,1)})',
    );
    expect(
      expectNumber(
        '=XNPV(' + xirr + ',{-1000,300,400,500},{DATE(2024,1,1),DATE(2024,7,1),DATE(2025,1,1),DATE(2025,7,1)})',
      ),
    ).toBeCloseTo(0, 6);
  });

  it('removes floating-point tails from integer annuity results', () => {
    expect(expectNumber('=FV(0.08/12,-45000,-100,0,0)')).toBe(-15000);
    expect(expectNumber('=PMT(10,60,5000)')).toBe(-50000);
  });

  it('retains precision for a very large present value', () => {
    const presentValue = expectNumber('=PV(0.08/12,-45000,-100)');
    expect(Math.abs(presentValue / -1.0766187672621131e134 - 1)).toBeLessThan(1e-12);
  });

  it('reads currency-formatted financial inputs', () => {
    const amounts: FormulaValue[] = ['$ 30,000.00', '$ 7,500.00', 10];
    const amountContext: EvalContext = {
      ...context,
      getCellValue: (row) => amounts[row] ?? null,
    };
    expect(evaluate('=SYD(A1,A2,A3,1)', amountContext)).toBeCloseTo(4090.909090909091, 9);
    expect(evaluate('=SYD(A1,A2,A3,10)', amountContext)).toBeCloseTo(409.09090909090907, 9);

    const localizedAmounts: FormulaValue[] = ['￥24,000', '￥3,000', 10];
    const localizedContext: EvalContext = {
      ...context,
      getCellValue: (row) => localizedAmounts[row] ?? null,
    };
    expect(evaluate('=DDB(A1,A2,A3,1,2)', localizedContext)).toBe(4800);
    expect(evaluate('=SLN(A1,A2,A3)', localizedContext)).toBe(2100);
    localizedAmounts[0] = '￥10,000,000';
    localizedAmounts[1] = '￥1,000,000';
    localizedAmounts[2] = 6;
    expect(evaluate('=DB(A1,A2,A3,1,7)', localizedContext)).toBeCloseTo(1860833.33333333, 7);
    localizedAmounts[0] = '10.00%';
    localizedAmounts[1] = 36;
    localizedAmounts[2] = '￥80,000';
    expect(evaluate('=IPMT(A1/12,1,A2,A3)', localizedContext)).toBeCloseTo(-666.666666666666, 9);
    localizedAmounts[0] = '10%';
    localizedAmounts[1] = 24;
    localizedAmounts[2] = '￥20,000.00';
    expect(evaluate('=PPMT(A1/12,1,A2,A3)', localizedContext)).toBeCloseTo(-756.231860083667, 9);
  });

  it('reads referenced percent and currency text in PV', () => {
    const cells: FormulaValue[] = [
      '',
      { kind: 'text', value: '$500.00', numericCoercion: 'allow' },
      { kind: 'text', value: '8%', numericCoercion: 'allow' },
      20,
    ];
    const amountContext: EvalContext = {
      ...context,
      getCellValue: (row) => cells[row] ?? null,
    };
    expect(evaluate('=PV(A3/12, 12*A4, A2, , 0)', amountContext)).toBeCloseTo(-59777.1458511878, 8);
  });

  it('accrues from issue before the first interest date and preserves method errors', () => {
    expect(expectNumber('=ACCRINT(DATE(2020,1,1),DATE(2020,7,1),DATE(2020,4,1),0.06,1000,2,0,FALSE)'))
      .toBe(15);
    const errorContext: EvalContext = {
      ...context,
      getCellValue: () => ({ kind: 'error', code: FormulaErrorCode.Name }),
    };
    expect(evaluate('=ACCRINT(DATE(2020,1,1),DATE(2020,7,1),DATE(2020,4,1),0.06,1000,2,0,A1)', errorContext))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Name });
  });

  it('respects the IRR iteration budget for an extremely skewed cash flow', () => {
    const flows = [-1e12, 1, 2];
    const flowContext: EvalContext = {
      ...context,
      getCellValue: (_row, col) => flows[col] ?? null,
      *iterateRange(_startRow, startCol, _endRow, endCol): Iterable<FormulaValue> {
        for (let col = startCol; col <= endCol; col++) yield flows[col] ?? null;
      },
    };
    expect(evaluate('=IRR(A1:C1)', flowContext)).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
  });

  it('rejects an IRR whose first Newton step leaves the valid rate domain', () => {
    const flows = [-59, 1, 2];
    const flowContext: EvalContext = {
      ...context,
      getCellValue: (_row, col) => flows[col] ?? null,
      *iterateRange(_startRow, startCol, _endRow, endCol): Iterable<FormulaValue> {
        for (let col = startCol; col <= endCol; col++) yield flows[col] ?? null;
      },
    };
    expect(evaluate('=IRR(A1:C1)', flowContext)).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    flows[0] = -6.0006;
    expect(evaluate('=IRR(A1:C1)', flowContext)).toBeCloseTo(-0.33337142546189, 12);
  });

  it('converges from a large IRR guess', () => {
    expect(expectNumber('=IRR({-1000,300,400,500},45000)')).toBeCloseTo(0.08896339469335, 12);
  });

  it('accepts a first odd coupon outside the regular maturity schedule', () => {
    expectError(
      '=ODDFPRICE(DATE(2024,1,1),DATE(2029,1,1),DATE(1900,1,3),DATE(2024,4,1),0.06,0.05,100,2,0)',
      FormulaErrorCode.Number,
    );
    expect(expectNumber(
      '=ODDFPRICE(DATE(2024,1,1),DATE(2029,1,1),DATE(2023,7,1),DATE(2024,4,1),0.06,0.05,100,2,0)',
    )).toBeCloseTo(104.540079138077, 10);
    expect(expectNumber(
      '=ODDFYIELD(DATE(2024,1,1),DATE(2029,1,1),DATE(2023,7,1),DATE(2024,4,1),0.06,95,100,2,0)',
    )).toBeCloseTo(0.0714990874114603, 12);
    expect(expectNumber(
      '=ODDFYIELD(DATE(2024,1,1),DATE(2029,1,1),DATE(2023,7,1),DATE(2024,4,1),0.06,0.5,100,2,0)',
    )).toBeCloseTo(3.93209163206322, 10);
    expectError(
      '=ODDFYIELD(DATE(2024,1,1),DATE(2029,1,1),DATE(2023,7,1),DATE(2024,4,1),0.06,95,1000000000000,2,0)',
      FormulaErrorCode.Number,
    );
    expect(expectNumber(
      '=ODDFPRICE(DATE(2024,1,1),DATE(2029,1,1),DATE(2023,7,1),DATE(2024,4,1),0.06,0.05,1000000000000000,2,0)',
    )).toBe(771612782239884);
    expectNumber(
      '=ODDFPRICE(DATE(2024,1,1),DATE(2029,4,1),DATE(2023,7,1),DATE(2024,4,1),0.06,0.05,100,2,0)',
    );
  });

  it('BUG-1077 rejects annuity factors that overflow before calculating payments', () => {
    expectError('=PMT(0.08/12,1000000000000,5000)', FormulaErrorCode.Number);
    expectError('=IPMT(0.08/12,1,1000000000000,5000)', FormulaErrorCode.Number);
    expectError('=PPMT(0.08/12,1,1000000000000,5000)', FormulaErrorCode.Number);
    expectError('=PMT(1000000000000,60,5000)', FormulaErrorCode.Number);
    expect(expectNumber('=PMT(0.08/12,60,5000)')).toBeLessThan(0);
  });

  it('prices and solves a short first coupon from its actual issue date', () => {
    const inputs = 'DATE(2008,11,11),DATE(2021,3,1),DATE(2008,10,15),DATE(2009,3,1),0.0575';
    const yieldRate = 0.0772455415978172;
    expect(expectNumber(`=ODDFPRICE(${inputs},${yieldRate},100,2,0)`)).toBeCloseTo(84.5, 10);
    expect(expectNumber(`=ODDFYIELD(${inputs},84.5,100,2,0)`)).toBeCloseTo(yieldRate, 11);
  });

  it('uses whole serial days for irregular cash flows and rejects boolean dates', () => {
    expect(expectNumber('=XNPV(0.1,{-1000,300,400,500},{1.3754,2,1,3})'))
      .toBeCloseTo(199.66061748634274, 10);
    expectError('=XIRR({-1000,300,400,500},FALSE)', FormulaErrorCode.Value);
  });

  it('rejects stored text rates in a multi-cell FVSCHEDULE range', () => {
    const rates: FormulaValue[] = ['1', 1, 2, 3, 0, 5, 6, 7];
    const rangeContext: EvalContext = {
      ...context,
      getCellValue: (row) => rates[row] ?? null,
      *iterateRange(startRow, _startCol, endRow): Iterable<FormulaValue> {
        for (let row = startRow; row <= endRow; row++) yield rates[row] ?? null;
      },
    };
    expect(evaluate('=FVSCHEDULE(100,A1:A8)', rangeContext))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=FVSCHEDULE(100,A1)', rangeContext)).toBe(200);
    rates[0] = { kind: 'error', code: FormulaErrorCode.NotAvailable };
    expect(evaluate('=FVSCHEDULE(100,A1:A8)', rangeContext))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=FVSCHEDULE(100,A1)', rangeContext))
      .toEqual({ kind: 'error', code: FormulaErrorCode.NotAvailable });
  });

  it('calculates NPV for rates below minus one and reports its zero denominator', () => {
    expect(expectNumber('=NPV(-1000000000000,300,400,500)')).toBeCloseTo(-2.999999999999e-10, 18);
    expectError('=NPV(-1,300,400,500)', FormulaErrorCode.DivisionByZero);
  });

  it('uses the RATE iteration limit from the supplied guess', () => {
    expect(expectNumber('=RATE(60,-100,5000)')).toBeCloseTo(0.00618341316125394, 12);
    expect(expectNumber('=RATE(TRUE,-100,5000)')).toBeCloseTo(-0.98, 12);
    expectError('=RATE(60,FALSE,5000)', FormulaErrorCode.Number);
    expectError('=RATE(60,-45000,5000)', FormulaErrorCode.Number);
    expectError('=RATE(60,-100,1)', FormulaErrorCode.Number);
  });

  it('skips text cells in IRR references and validates the guess separately', () => {
    expectError('=IRR("")', FormulaErrorCode.Value);
    const textContext: EvalContext = {
      ...context,
      getCellValue: () => 'not a cash flow',
      *iterateRange(startRow, startColumn, endRow, endColumn): Iterable<FormulaValue> {
        for (let row = startRow; row <= endRow; row++) {
          for (let column = startColumn; column <= endColumn; column++) yield textContext.getCellValue(row, column);
        }
      },
    };
    expect(evaluate('=IRR(A1:A3)', textContext)).toEqual({ kind: 'error', code: '#NUM!' });
    expectError('=IRR({-1000,300,400,500},-1.2503)', FormulaErrorCode.Value);
    const nameContext: EvalContext = { ...context, getCellValue: () => ({ kind: 'error', code: FormulaErrorCode.Name }) };
    expect(evaluate('=IRR({-1000,300,400,500},A1)', nameContext)).toEqual({ kind: 'error', code: '#NAME?' });
  });

  it('rejects direct boolean and numeric-text cash flows in IRR and MIRR', () => {
    for (const value of ['TRUE', 'FALSE', '"0"', '"1"', '"1.5"', '"001"']) {
      expectError(`=IRR(${value})`, FormulaErrorCode.Value);
    }
    for (const value of ['TRUE', '"0"']) {
      expectError(`=MIRR(${value},0.08,0.1)`, FormulaErrorCode.Value);
    }
    expectError('=IRR(1)', FormulaErrorCode.Number);
    expectError('=MIRR(1,0.08,0.1)', FormulaErrorCode.DivisionByZero);
  });

  it('skips boolean cells in NPV references without consuming a period', () => {
    const booleanCellContext: EvalContext = {
      ...context,
      getCellValue: (row, column) => row === 0 && column === 0 ? false : context.getCellValue(row, column),
      *iterateRange(startRow, startColumn, endRow, endColumn): Iterable<FormulaValue> {
        for (let row = startRow; row <= endRow; row++) {
          for (let column = startColumn; column <= endColumn; column++) {
            yield booleanCellContext.getCellValue(row, column);
          }
        }
      },
    };
    expect(expectNumber('=NPV(0.1,FALSE,400,500)')).toBeCloseTo(706.235912847483, 9);
    expect(evaluate('=NPV(0.1,A1,400,500)', booleanCellContext)).toBeCloseTo(776.859504132231, 9);
    expect(evaluate('=NPV(0.1,IF(TRUE,A1,0),400,500)', booleanCellContext)).toBeCloseTo(776.859504132231, 9);
  });

  it('calculates DB with high salvage and preserves period bounds', () => {
    expect(expectNumber('=DB(0,1000,5,1,12)')).toBe(0);
    expect(expectNumber('=DB(1,1000,5,1,12)')).toBe(-2.981);
    expect(expectNumber('=DB(10000,45000,5,1,12)')).toBe(-3510);
    expectError('=DB(1000,5,1,12)', FormulaErrorCode.Number);
    expect(expectNumber('=DB(10000,1000,5,5.8755,12)')).toBeCloseTo(584.98375128849, 9);
    expectError('=DB(10000,1000,5,6,12)', FormulaErrorCode.Number);
    expect(expectNumber('=DB(10000,1000,5,1,1.8751)')).toBe(307.5);
  });

  it('uses the remaining months for the final DB period', () => {
    expect(expectNumber('=DB(10000000,1000000,6,7,7)')).toBeCloseTo(158450.984738481, 9);
    expect(expectNumber('=DB(10000000,1000000,6,6,7)')).toBeCloseTo(558417.567360284, 9);
    const cells: Record<number, string | number> = { 0: '￥10,000,000', 1: '￥1,000,000', 2: 6, 3: 7 };
    const contextWithCurrency: EvalContext = {
      ...context,
      getCellValue: (row) => cells[row] ?? null,
    };
    expect(evaluate('=DB(A1,A2,A3,7,A4)', contextWithCurrency)).toBeCloseTo(158450.984738481, 9);
    cells[3] = 12;
    expect(evaluate('=DB(A1,A2,A3,7,A4)', contextWithCurrency)).toEqual({
      kind: 'error', code: FormulaErrorCode.Number,
    });
  });

  it('accepts negative PV periods and keeps large positive periods stable', () => {
    expect(expectNumber('=PV(0.08/12,-1,-100)')).toBe(-100);
    expect(expectNumber('=PV(0.08/12,-61,-100)')).toBeCloseTo(-7496.67019535423, 8);
    expect(expectNumber('=PV(10,60,-100)')).toBe(10);
    expectError('=PV(1000000000000,60,-100)', FormulaErrorCode.Number);
  });

  it('converges RATE for a payment much smaller than the present value', () => {
    expect(expectNumber('=RATE(60,-1e-12,5000)')).toBeCloseTo(-0.445106765155595, 13);
  });

  it('uses WPS compounding for a tiny negative PMT period', () => {
    expect(expectNumber('=PMT(0.08/12,-1e-12,5000)')).toBe(5003999585967180);
    expect(evaluate('=PMT(0.08/12,A1,5000)', { ...context, getCellValue: () => -1e-12 }))
      .toBe(5003999585967180);
  });

  it('coerces decimal date text before checking financial date bounds', () => {
    expect(expectNumber('=COUPDAYS("0",DATE(2026,12,31),2,0)')).toBe(180);
    expect(expectNumber('=COUPDAYS(TRUE,DATE(2026,12,31),2,0)')).toBe(180);
    expect(expectNumber('=COUPDAYBS(TRUE,DATE(2026,12,31),2,0)')).toBe(1);
    expect(expectNumber('=COUPDAYSNC(TRUE,DATE(2026,12,31),2,0)')).toBe(179);
    expectError('=PRICE("0",DATE(2029,1,1),0.06,0.05,100,2,0)', FormulaErrorCode.Number);
    expectError('=COUPNUM(0,DATE(2026,12,31),2,0)', FormulaErrorCode.Number);
    expect(expectNumber('=COUPNUM(182,DATE(2026,12,31),2,0)')).toBe(253);
    expect(expectNumber('=COUPDAYS(DATE(2024,3,15),DATE(2026,12,31),2,3.6251)')).toBe(182.5);
    expect(expectNumber('=COUPDAYBS(DATE(2024,3,15),DATE(2026,12,31),2,4.1255)')).toBe(75);
  });

  it('applies the 30/360 convention to days until the next coupon without changing other schedule results', () => {
    expect(expectNumber('=COUPDAYSNC(DATE(2024,3,15),DATE(2026,12,31),"1.5",0)')).toBe(286);
    expect(expectNumber('=COUPDAYSNC("2024-02-29",DATE(2026,12,31),2,0)')).toBe(120);
    const dateTextContext: EvalContext = {
      ...context,
      getCellValue: (row, column) => row === 0 && column === 0 ? '2024-02-29' : 0,
    };
    expect(evaluate('=COUPDAYSNC(A1,DATE(2026,12,31),2,0)', dateTextContext)).toBe(120);
    expect(expectNumber('=COUPDAYBS("2024-02-29",DATE(2026,12,31),2,0)')).toBe(59);
    expect(expectNumber('=DURATION(59,DATE(2029,1,1),0.06,0.05,2,0)')).toBeCloseTo(20.275632859708907, 11);
  });

  it('BUG-1050 counts the phantom 1900 leap day once in bond duration', () => {
    const maturity = 'DATE(2029,1,1),0.06,0.05,2,0)';
    expect(expectNumber(`=DURATION(60,${maturity}`)).toBeCloseTo(20.272855081931123, 11);
    expect(expectNumber(`=MDURATION(60,${maturity}`)).toBeCloseTo(19.778395201884024, 11);
    const referenced = { ...context, getCellValue: () => 60 };
    expect(evaluate(`=DURATION(A1,${maturity}`, referenced)).toBeCloseTo(20.272855081931123, 11);
    expect(evaluate(`=MDURATION(A1,${maturity}`, referenced)).toBeCloseTo(19.778395201884024, 11);
    expect(evaluate(`=DURATION(A1,${maturity}`, { ...context, getCellValue: () => 61 }))
      .toBeCloseTo(20.267299526375574, 11);
  });

  it('excludes the first day after a February month-end coupon from remaining days', () => {
    for (const year of [2020, 2021]) {
      expect(expectNumber(`=COUPDAYSNC(DATE(${year},3,1),DATE(${year},8,31),2,0)`)).toBe(179);
      expect(expectNumber(`=COUPDAYS(DATE(${year},3,1),DATE(${year},8,31),2,0)`)).toBe(180);
    }
  });

  it('rejects excess arguments to fixed-arity financial functions', () => {
    expectError('=FV(0.1,2,-100,0,0,999)', FormulaErrorCode.Value);
    expectError('=EFFECT(0.1,12,999)', FormulaErrorCode.Value);
    expectError('=RRI(2,100,121,999)', FormulaErrorCode.Value);
    expect(expectNumber('=FV(0.1,2,-100,0,0)')).toBe(210);
    expect(expectNumber('=EFFECT(0.1,12)')).toBeCloseTo(0.1047130674413, 10);
    expect(expectNumber('=RRI(2,100,121)')).toBeCloseTo(0.1, 12);
  });

  it('BUG-1055 follows WPS compounding for representable tiny rates and long terms', () => {
    expect(expectNumber('=FV(1E-12,60,-100,0,0)')).toBeCloseTo(6000.533403494046, 8);
    const longTerm = expectNumber('=FV(0.08/12,45000,-100,0,0)');
    expect(Math.abs(longTerm / 1.076618767262113e134 - 1)).toBeLessThan(1e-12);
    expect(expectNumber('=FV(1E-17,1E17,0,-1)')).toBeCloseTo(Math.E, 12);
  });

  it('keeps a finite FVSCHEDULE result when intermediate principal multiplication overflows', () => {
    expect(expectNumber('=FVSCHEDULE(1E308,{1,-0.5})')).toBe(1e308);
    expect(expectNumber('=FVSCHEDULE(1E307,{1,-0.5})')).toBe(1e307);
  });

  it('cancels large NPV cash flows before intermediate discounted terms overflow', () => {
    expect(expectNumber('=NPV(-0.5,1E308,-5E307)')).toBe(0);
    expect(expectNumber('=NPV(-0.5,1E307,-5E306)')).toBe(0);
  });

  it('keeps MIRR unchanged when large cash flows are uniformly scaled', () => {
    expect(expectNumber('=MIRR({-1E308,1E308,0},0,1)')).toBeCloseTo(Math.SQRT2 - 1, 12);
    expect(expectNumber('=MIRR({-1E307,1E307,0},0,1)')).toBeCloseTo(Math.SQRT2 - 1, 12);
  });

  it('discounts a finite PV without computing an overflowing growth factor', () => {
    expect(expectNumber('=PV(1,1024,0,-1)')).toBe(Math.pow(2, -1024));
    expect(expectNumber('=POWER(2,-1024)')).toBe(Math.pow(2, -1024));
  });

  it('prices a full calendar-year treasury bill across leap day', () => {
    expect(expectNumber('=TBILLPRICE(DATE(2023,3,1),DATE(2024,3,1),0.05)'))
      .toBeCloseTo(94.9861111111111, 11);
    expect(expectNumber('=TBILLPRICE(DATE(2023,1,1),DATE(2024,1,1),0.05)'))
      .toBeCloseTo(94.9861111111111, 11);
    expectError('=TBILLPRICE(DATE(2023,3,1),DATE(2024,3,2),0.05)', FormulaErrorCode.Number);
  });

  it('prices coupons on face value and validates negative bond rates', () => {
    expect(expectNumber('=PRICE(DATE(2024,1,1),DATE(2029,1,1),0.06,0.05,1,2,0)')).toBeCloseTo(27.0373901946385, 9);
    expect(expectNumber('=PRICE(DATE(2024,1,1),DATE(2029,1,1),0.06,0.05,"￥100",2,0)')).toBeCloseTo(
      expectNumber('=PRICE(DATE(2024,1,1),DATE(2029,1,1),0.06,0.05,100,2,0)'), 12,
    );
    expect(expectNumber('=YIELD(DATE(2024,1,1),DATE(2029,1,1),0.06,95,"¥100",2,0)')).toBeCloseTo(
      expectNumber('=YIELD(DATE(2024,1,1),DATE(2029,1,1),0.06,95,100,2,0)'), 12,
    );
    expectError('=SLN("￥300,000","￥75,000",10)', FormulaErrorCode.Value);
    expectError('=PMT(0.08/12,60,"￥100,000")', FormulaErrorCode.Value);
    expectError('=PRICE(DATE(2024,1,1),DATE(2029,1,1),-1,0.05,100,2,0)', FormulaErrorCode.Number);
    expectError('=PRICE(DATE(2024,1,1),DATE(2029,1,1),0.06,-0.05,100,2,0)', FormulaErrorCode.Number);
    expectError('=PRICE(DATE(2024,1,1),DATE(2029,1,1),0.06,0.05,0,2,0)', FormulaErrorCode.Number);
    expectError('=PRICE(DATE(2024,1,1),DATE(2029,1,1),0.06,0.05,-0.5,2,0)', FormulaErrorCode.Number);
    expect(expectNumber('=PV(0.08/12,"2024-02-29",-100)')).toBe(15000);
  });

  it('rejects an overflowing fractional dollar scale while keeping finite controls', () => {
    expectError('=DOLLARDE(0.5,1.79E308)', FormulaErrorCode.Number);
    expectError('=DOLLARFR(0.5,1.79E308)', FormulaErrorCode.Number);
    expect(expectNumber('=DOLLARDE(0.5,1E308)')).toBe(0.5);
    expect(expectNumber('=DOLLARFR(0.5,1E308)')).toBe(0.5);
  });

  it('round-trips fractional dollar conversion and depreciation schedules', () => {
    expect(expectNumber('=DOLLARDE(DOLLARFR(12.125,16),16)')).toBeCloseTo(12.125, 10);
    expect(expectNumber('=DOLLARDE(-0.5,16)')).toBeCloseTo(-3.125, 10);
    expect(expectNumber('=DOLLARFR(-0.5,16)')).toBeCloseTo(-0.08, 10);
    expect(evaluate('=DOLLARDE(1.125,0.5)')).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=DOLLARFR(1.125,0)')).toEqual({ kind: 'error', code: '#DIV/0!' });
    expect(evaluate('=DOLLARDE(1.125,-0.25)')).toEqual({ kind: 'error', code: '#NUM!' });
    expect(evaluate('=DOLLARFR(1.125,-0.25)')).toEqual({ kind: 'error', code: '#NUM!' });
    expectError('=DISC(DATE(2024,1,1),DATE(2024,7,1),-0.25,100,0)', FormulaErrorCode.Number);
    expectError('=DISC(DATE(2024,1,1),DATE(2024,7,1),97,100,-0.5)', FormulaErrorCode.Number);
    expect(expectNumber('=DISC(TRUE,DATE(2024,7,1),97,100,0)')).toBeCloseTo(0.000240963855421687, 15);
    expectError('=DISC(DATE(2024,1,1),FALSE,97,100,0)', FormulaErrorCode.Number);
    expectError('=PRICEDISC(TRUE,DATE(2024,7,1),0.05,100,0)', FormulaErrorCode.Value);
    expectError('=AMORDEGRC(TRUE,DATE(2020,1,1),DATE(2020,7,1),300,1,0.15,1)', FormulaErrorCode.Number);
    expectError('=AMORLINC(TRUE,DATE(2020,1,1),DATE(2020,7,1),300,1,0.15,1)', FormulaErrorCode.Number);
    const falseDateCell = { ...context, getCellValue: () => false };
    expect(evaluate('=ACCRINT(DATE(2020,1,1),A1,DATE(2020,4,1),0.06,1000,2,0)', falseDateCell))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Number });
    expect(expectNumber('=ACCRINT(DATE(2020,1,1),1,DATE(2020,4,1),0.06,1000,2,0)')).toBe(15);
    expect(expectNumber('=PRICE(TRUE,DATE(2029,1,1),0.06,0.05,100,2,0)'))
      .toBeCloseTo(119.965780573668, 10);
    const logicalCell = { ...context, getCellValue: () => true };
    expect(evaluate('=PRICE(A1,DATE(2029,1,1),0.06,0.05,100,2,0)', logicalCell))
      .toBeCloseTo(119.965780573668, 10);
    expect(evaluate('=PRICE(IF(TRUE,A1,0),DATE(2029,1,1),0.06,0.05,100,2,0)', logicalCell))
      .toBeCloseTo(119.965780573668, 10);
    expect(evaluate('=ODDFPRICE(A1,DATE(2029,1,1),DATE(2023,7,1),DATE(2024,4,1),0.06,0.05,100,2,0)', logicalCell))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expect(evaluate('=PRICEMAT(A1,DATE(2025,1,1),DATE(2023,1,1),0.06,0.05,0)', logicalCell))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
    expectError(
      '=ODDFYIELD("",DATE(2029,1,1),DATE(2023,7,1),DATE(2024,4,1),0.06,95,100,2,0)',
      FormulaErrorCode.Value,
    );
    expect(expectNumber('=DB(10000,1000,5,1,12)')).toBe(3690);
    expect(expectNumber('=DB(10000,1,5,1,12)')).toBe(8420);
    expect(expectNumber('=SLN(10000,1000,5)')).toBe(1800);
    expect(expectNumber('=SYD(10000,1000,5,1)')).toBe(3000);
    expect(expectNumber('=SYD(10000,1000,5,0.1251)')).toBe(3524.94);
    expect(expectNumber('=SYD(-1000000000000000,1000,5,1)')).toBe(-333333333333667);
    expect(expectNumber('=DDB(10000,1000,5,1,2)')).toBe(4000);
    expect(expectNumber('=DDB(10000,1000,5,1.1252,2)')).toBeCloseTo(3752.18746165823, 10);
    expect(expectNumber('=DDB(10000,1000,5,1.3754,2)')).toBeCloseTo(3302.0068564787, 10);
    expect(expectNumber('=VDB(10000,1000,5,0,1)')).toBe(4000);
    expect(expectNumber('=VDB(10000,1000,5,0,1,0)')).toBe(1800);
    expect(expectNumber('=VDB(0,1000,5,0,1)')).toBe(0);
    expect(expectNumber('=VDB(10000,45000,5,0,1)')).toBe(0);
    expectError('=VDB(10000,1000,0.1251,0,1)', FormulaErrorCode.Number);
    expectError('=VDB(10000,1000,5,0,"2024-02-29")', FormulaErrorCode.Number);
    expect(expectNumber('=YIELD(DATE(2024,1,1),DATE(2029,1,1),0.06,100,"2024-02-29",2,0)'))
      .toBeCloseTo(1.70037264950584, 12);
    expect(expectNumber('=YIELD(DATE(2024,1,1),DATE(2029,1,1),0.06,100,3.6251,2,0)'))
      .toBeCloseTo(-0.299997992729398, 12);
    expect(expectNumber('=AMORLINC(2400,DATE(2020,1,1),DATE(2020,7,1),300,1,0.15,1)')).toBeGreaterThan(0);
    expect(expectNumber('=AMORDEGRC(2400,DATE(2020,1,1),DATE(2020,7,1),300,1,0.15,1)')).toBeGreaterThan(0);
  });

  it('preserves depreciation domain results and financial error codes', () => {
    expect(expectNumber('=SLN(-10,1000,5)')).toBe(-202);
    expect(expectNumber('=SLN(10000,1000,-60)')).toBe(-150);
    expect(expectNumber('=DDB(0,1000,5,1,2)')).toBe(0);
    expect(expectNumber('=DDB(1,1000,5,1,2)')).toBe(0);
    expect(expectNumber('=DB(0,100,5,1)')).toBe(0);
    expect(expectNumber('=DB(1000,2000,5,1)')).toBe(-149);
    expectError('=DDB(0,1000,0,1,2)', FormulaErrorCode.Number);
    expectError('=SLN("",1000,5)', FormulaErrorCode.Value);
    expectError('=DDB("",1000,5,1,2)', FormulaErrorCode.Value);
    expectError('=VDB("",1000,5,0,1)', FormulaErrorCode.Value);
    expectError('=DDB(-1,1000,5,1,2)', FormulaErrorCode.Number);
    expectError('=SYD(10000,1000,-60,1)', FormulaErrorCode.Number);
    expectError('=SYD(10000,-1,5,1)', FormulaErrorCode.Number);
    expectError('=AMORDEGRC(2400,DATE(2020,1,1),DATE(2020,7,1),300,-0.5,0.15,1)', FormulaErrorCode.Number);
    expectError('=AMORDEGRC(2400,DATE(2020,1,1),DATE(2020,7,1),300,1,0.5,1)', FormulaErrorCode.Number);
    expect(expectNumber('=AMORDEGRC(2400,DATE(2020,1,1),DATE(2020,7,1),300,4.1255,0.15,1)')).toBe(179);
    expect(expectNumber('=AMORDEGRC(2400,1,DATE(2020,7,1),300,1,0.15,1)')).toBe(113);
    expectError('=VDB(10000,-1,5,0,1)', FormulaErrorCode.Number);
    expectError('=MDURATION(0,DATE(2029,1,1),0.06,0.05,2,0)', FormulaErrorCode.Number);
    expectError('=DURATION(DATE(2024,1,1),DATE(2029,1,1),0.06,-1.005,2,0)', FormulaErrorCode.Number);
    expectError('=MDURATION(DATE(2024,1,1),DATE(2029,1,1),0.06,-1.005,2,0)', FormulaErrorCode.Number);
    expectError('=ODDFPRICE(-1,DATE(2029,1,1),DATE(2023,7,1),DATE(2024,4,1),0.06,0.05,100,2,0)', FormulaErrorCode.Number);
    expectError('=ODDFPRICE(DATE(2024,1,1),DATE(2029,1,1),DATE(2023,7,1),DATE(2024,4,1),-0.01,0.05,100,2,0)', FormulaErrorCode.Number);
    expectError('=ODDFPRICE(1/0,DATE(2029,1,1),DATE(2023,7,1),DATE(2024,4,1),0.06,0.05,100,2,0)', FormulaErrorCode.DivisionByZero);
  });

  it('uses actual coupon period lengths for basis 2 and 3 bond duration', () => {
    expect(expectNumber('=DURATION(DATE(2024,1,1),DATE(2029,1,1),0.06,0.05,2,2.675)'))
      .toBeCloseTo(4.408407590492557, 12);
    expect(expectNumber('=MDURATION(DATE(2024,1,1),DATE(2029,1,1),0.06,0.05,2,2.675)'))
      .toBeCloseTo(4.30088545413908, 12);
  });

  it('keeps the first principal payment stable when annuity growth is very large', () => {
    expect(expectNumber('=PPMT(4.6252,1,60,5000)') / -2.2689369925821086e-41).toBeCloseTo(1, 12);
    expect(expectNumber('=PPMT("2024-02-29",1,60,5000)') / -9.115284606048447e-272).toBeCloseTo(1, 12);
  });

  it('matches Excel depreciation and percentage-text yield examples', () => {
    expect(expectNumber('=AMORDEGRC(2400,39679,39813,300,1,0.15,1)')).toBe(776);
    expect(expectNumber('=YIELDMAT("2008-3-15","2008-11-3","2007-11-8","6.25%",100.0123,0)')).toBeCloseTo(
      0.06095433369153867,
      9,
    );
  });

  it('returns stable Excel-style errors for malformed financial inputs', () => {
    expectError('=MIRR(5,0.08,0.1)', FormulaErrorCode.DivisionByZero);
    expectError('=MIRR({1,2},0.08,0.1)', FormulaErrorCode.Number);
    expectError('=PMT(0,0,100)', FormulaErrorCode.DivisionByZero);
    expectError('=COUPDAYS(DATE(2025,1,1),DATE(2024,1,1),2,0)', FormulaErrorCode.Number);
    expectError('=PRICE(DATE(2024,1,1),DATE(2029,1,1),0.06,0.05,100,3,0)', FormulaErrorCode.Number);
    expectError('=ACCRINT(DATE(2020,1,1),DATE(2020,7,1),DATE(2020,4,1),0.06,1000,2,9)', FormulaErrorCode.Number);
    expectError('=IRR({1,2,3})', FormulaErrorCode.Number);
    expectError('=XNPV(0.1,{-100,100},{DATE(2024,1,1),DATE(2023,1,1)})', FormulaErrorCode.Number);
    expect(expectNumber('=DDB(100,200,5,1,2)')).toBe(0);
    expect(expectNumber('=VDB(100,200,5,0,1)')).toBe(0);
    expect(expectNumber('=DDB(100,100,5,1,2)')).toBe(0);
    expect(expectNumber('=VDB(100,100,5,0,1)')).toBe(0);
  });

  it('BUG-241 accepts Treasury bill prices at or above face value', () => {
    const base = '=TBILLYIELD(DATE(2024,1,1),DATE(2024,7,1),';
    expect(expectNumber(`${base}100)`)).toBe(0);
    expect(expectNumber(`${base}101)`)).toBeCloseTo(-0.0195843760200196, 12);
    expect(expectNumber(`${base}99)`)).toBeGreaterThan(0);
    expectError(`${base}0)`, FormulaErrorCode.Number);
  });

  it('ignores text in MIRR references and reports zero-signed cash flows as division errors', () => {
    const cells: FormulaValue[] = ['abc', 1, 2];
    const referenceContext: EvalContext = {
      ...context,
      getCellValue: (row) => cells[row] ?? null,
      *iterateRange(startRow, _startCol, endRow): Iterable<FormulaValue> {
        for (let row = startRow; row <= endRow; row++) yield cells[row] ?? null;
      },
    };
    for (const formula of [
      '=MIRR(A1,0.08,0.1)',
      '=MIRR(IF(TRUE,A1,0),0.08,0.1)',
      '=MIRR(A1:A3,0.08,0.1)',
    ]) {
      expect(evaluate(formula, referenceContext)).toEqual(expect.objectContaining({
        kind: 'error', code: FormulaErrorCode.DivisionByZero,
      }));
    }
  });

  it('rejects negative fractional AMORLINC periods before truncation', () => {
    expectError('=AMORLINC(2400,DATE(2020,1,1),DATE(2020,7,1),300,-0.5,0.15,1)', FormulaErrorCode.Number);
    expectError('=AMORLINC(2400,DATE(2020,1,1),DATE(2020,7,1),300,-1E-12,0.15,1)', FormulaErrorCode.Number);
  });

  it('preserves errors supplied to scalar financial arguments', () => {
    expectError('=SLN(1/0,1000,5)', FormulaErrorCode.DivisionByZero);
    expectError('=DDB(10000,1/0,5,1)', FormulaErrorCode.DivisionByZero);
    expectError('=PRICEMAT(DATE(2024,1,1),DATE(2025,1,1),DATE(2023,1,1),1/0,0.05,0)', FormulaErrorCode.DivisionByZero);
  });
});
