import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { ChineseExcelDateTimeLocale, FunctionRegistry } from '../src/functions';
import {
  FormulaErrorCode,
  FormulaDateSystem,
  createFormulaError,
  type EvalContext,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';

function createContext(data: Record<string, FormulaValue> = {}, shape: [number, number] = [200_000, 10]): EvalContext {
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
    currentDateTime: () => Date.UTC(2011, 11, 1, 6, 0, 0),
  };
}

function evaluate(
  formula: string,
  data: Record<string, FormulaValue> = {},
  context?: Partial<EvalContext>,
): FormulaValue {
  const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
  const base = createContext(data);
  return evaluator.evaluate(new FormulaParser().parse(formula), { ...base, ...context });
}

describe('date/time built-ins', () => {
  it('uses the workbook date system for DATE serials', () => {
    expect(evaluate('=DATE(1904,2,29)')).toBe(1521);
    expect(evaluate('=DATE(1904,2,29)', {}, { dateSystem: FormulaDateSystem.Excel1904 })).toBe(59);
    expect(evaluate('=DATE(1904,2,12)', {}, { dateSystem: FormulaDateSystem.Excel1904 })).toBe(42);
  });
  it('reports the product error for invalid ISOWEEKNUM arity', () => {
    expect(evaluate('=ISOWEEKNUM()')).toEqual({ kind: 'error', code: FormulaErrorCode.Name });
    expect(evaluate('=ISOWEEKNUM(45000,2)')).toEqual({ kind: 'error', code: FormulaErrorCode.Name });
  });

  it('uses the phantom 1900 leap day in DAYS360 month-end rules', () => {
    expect(evaluate('=DAYS360(59,"2030-12-31")')).toBe(47103);
    expect(evaluate('=DAYS360(60,"2030-12-31")')).toBe(47100);
    expect(evaluate('=DAYS360("2024-1-1","2030-12-31","a,b")'))
      .toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });

  it('keeps February month ends within February in US 30/360 calculations', () => {
    expect(evaluate('=DAYS360(DATE(2024,2,28),DATE(2024,2,29))')).toBe(1);
    expect(evaluate('=DAYS360(DATE(2024,1,15),DATE(2024,2,29))')).toBe(44);
    expect(evaluate('=DAYS360(DATE(2023,2,27),DATE(2023,2,28))')).toBe(1);
    expect(evaluate('=DAYS360(DATE(2024,1,31),DATE(2024,2,29))')).toBe(30);
    expect(evaluate('=DAYS360(DATE(2024,4,15),DATE(2024,4,30))')).toBe(15);
    expect(evaluate('=YEARFRAC(DATE(2024,1,15),DATE(2024,2,29),0)')).toBeCloseTo(44 / 360, 12);
  });

  it('uses the relevant year length for one-year actual/actual spans', () => {
    expect(evaluate('=YEARFRAC(DATE(2019,12,31),DATE(2020,1,1),1)')).toBeCloseTo(1 / 365, 14);
    expect(evaluate('=YEARFRAC(DATE(2019,7,1),DATE(2020,7,1),1)')).toBe(1);
    expect(evaluate('=YEARFRAC(DATE(2020,12,31),DATE(2021,1,1),1)')).toBeCloseTo(1 / 365, 14);
  });

  it('uses Excel weekdays for ISO weeks before March 1900', () => {
    expect(evaluate('=WEEKNUM(1,21)')).toBe(52);
    expect(evaluate('=ISOWEEKNUM(1)')).toBe(52);
    expect(evaluate('=WEEKNUM(61,21)')).toBe(9);
  });

  const dateData: Record<string, FormulaValue> = {
    '0,0': '2011-4-15',
    '1,0': '2021 年 12 月 31 日',
    '2,0': '2021 年 1 月 1 日',
    '3,0': '2011-1-15',
    '4,0': '2012-3-9',
    '5,0': '2012-10-1',
    '6,0': '2013-3-1',
    '7,0': '2012-11-22',
    '8,0': '2012-12-4',
    '9,0': '2013-1-21',
    '10,0': '2008-2-14',
    '11,0': '2008-10-1',
    '12,0': 151,
    '13,0': '11/26/2008',
    '14,0': '12/4/2008',
    '15,0': '1/21/2009',
    '16,0': '7/5/2023',
    '17,0': '7/5/2025',
    '18,0': '1/1/2012',
    '19,0': '7/30/2012',
  };

  const cases: Array<[string, FormulaValue, Record<string, FormulaValue>?]> = [
    ['=DATE(2011,8,22)', 40777],
    ['=DATE(108,1,2)', 39449],
    ['=DATEDIF("1/1/2001","1/1/2003","Y")', 2],
    ['=DATEDIF("6/1/2001","8/15/2002","D")', 440],
    ['=DATEDIF("6/1/2001","8/15/2002","YD")', 75],
    ['=DATEVALUE("2011-8-22")', 40777],
    ['=DATEVALUE("22-MAY-2011")', 40685],
    ['=DATEVALUE("2011/02/23")', 40597],
    ['=DATEVALUE("5-JUL")', 40729],
    ['=DATEVALUE(B1&"/"&B2&"/"&B3)', createFormulaError(FormulaErrorCode.Value), { '0,1': '11', '1,1': '3', '2,1': '2011' }],
    ['=DAY(A1)', 15],
    ['=DAYS(A2,A3)', 364],
    ['=DAYS360("2011-1-30","2011-2-1")', 1],
    ['=DAYS360("2011-1-1","2011-12-31")', 360],
    ['=EDATE(A4,1)', 40589],
    ['=EDATE(A4,-1)', 40527],
    ['=EOMONTH("2011-1-1",1)', 40602],
    ['=EOMONTH("2011-1-1",-3)', 40482],
    ['=HOUR(0.75)', 18],
    ['=HOUR("2011-7-18 7:45")', 7],
    ['=ISOWEEKNUM(A5)', 10],
    ['=MINUTE("12:45 PM")', 45],
    ['=MONTH(A1)', 4],
    ['=NETWORKDAYS(A6,A7)', 110],
    ['=NETWORKDAYS(A6,A7,A8)', 109],
    ['=NETWORKDAYS(A6,A7,A8:A10)', 107],
    ['=NETWORKDAYS.INTL(DATE(2006,1,1),DATE(2006,1,31))', 22],
    ['=NETWORKDAYS.INTL(DATE(2006,2,28),DATE(2006,1,31))', -21],
    ['=NETWORKDAYS.INTL(DATE(2006,1,1),DATE(2006,2,1),7,{"2006/1/2","2006/1/16"})', 22],
    ['=NETWORKDAYS.INTL(DATE(2006,1,1),DATE(2006,2,1),"0010001",{"2006/1/2","2006/1/16"})', 20],
    ['=SECOND("4:48:18 PM")', 18],
    ['=TIME(12,0,0)', 0.5],
    ['=TIME(16,48,10)', 0.7001157407407408],
    ['=TIMEVALUE("2:24 AM")', 0.1],
    ['=TIMEVALUE("2024-02-29")', 0],
    ['=TIMEVALUE("2011-8-22 6:35 AM")', 0.2743055555555556],
    ['=TIMEVALUE("2011-8-22 上午 6:35")', 0.2743055555555556],
    ['=WEEKDAY(A11)', 5],
    ['=WEEKDAY(A11,2)', 4],
    ['=WEEKDAY(A11,3)', 3],
    ['=WEEKNUM(A5)', 10],
    ['=WEEKNUM(A5,2)', 11],
    ['=WORKDAY(A12,A13)', 39933],
    ['=WORKDAY(A12,A13,A14:A16)', createFormulaError(FormulaErrorCode.Value)],
    ['=WORKDAY.INTL(DATE(2012,1,1),90,11)', 41013],
    ['=WORKDAY.INTL(DATE(2012,1,1),30,17)', 40944],
    ['=YEAR(A17)', createFormulaError(FormulaErrorCode.Value)],
    ['=YEAR(A18)', createFormulaError(FormulaErrorCode.Value)],
    ['=YEARFRAC(A19,A20)', createFormulaError(FormulaErrorCode.Value)],
    ['=YEARFRAC(A19,A20,1)', createFormulaError(FormulaErrorCode.Value)],
    ['=YEARFRAC(A19,A20,3)', createFormulaError(FormulaErrorCode.Value)],
  ];

  it.each(cases)('%s', (...[formula, expected, extraData]) => {
    const actual = evaluate(
      formula,
      { ...dateData, ...(extraData ?? {}) },
      {
        dateTimeLocale: ChineseExcelDateTimeLocale,
      },
    );
    if (typeof expected === 'number') expect(actual).toEqual(expect.closeTo(expected, 10));
    else expect(actual).toEqual(expected);
  });

  it('evaluates volatile date/time functions through the injected clock', () => {
    expect(evaluate('=TODAY()')).toBe(40878);
    expect(evaluate('=TODAY()+5')).toBe(40883);
    expect(evaluate('=DAY(TODAY())')).toBe(1);
    expect(evaluate('=MONTH(TODAY())')).toBe(12);
    expect(evaluate('=NOW()')).toBeCloseTo(40878.25, 12);
    expect(evaluate('=NOW()-0.5')).toBeCloseTo(40877.75, 12);
  });

  it('uses the injected current year for yearless DATEVALUE text', () => {
    expect(
      evaluate(
        '=DATEVALUE("5-JUL")',
        {},
        {
          currentDateTime: () => Date.UTC(2008, 0, 1),
        },
      ),
    ).toBe(39634);
  });

  it('uses the text-year cutoff without changing numeric DATE years', () => {
    expect(evaluate('=YEAR(DATEVALUE("1/1/19"))')).toBe(2019);
    expect(evaluate('=YEAR(DATEVALUE("1/1/29"))')).toBe(2029);
    expect(evaluate('=YEAR(DATEVALUE("1/1/30"))')).toBe(1930);
    expect(evaluate('=YEAR(DATE(19,1,1))')).toBe(1919);
  });

  it('parses slash-date text from a cell reference and recalculates when its text changes', () => {
    expect(evaluate('=DATEVALUE(B65)', { '64,1': '1/2/2024' })).toBe(45293);
    expect(evaluate('=DATEVALUE(B65)', { '64,1': '1/3/2024' })).toBe(45294);
    expect(evaluate('=DATEVALUE("1/2/2024")')).toBe(45293);
    expect(evaluate('=DATEVALUE(B65)', { '64,1': 'not a date' })).toEqual(createFormulaError(FormulaErrorCode.Value));
  });

  it('propagates formula errors from WORKDAY.INTL weekend arguments', () => {
    const divisionByZero = createFormulaError(FormulaErrorCode.DivisionByZero);
    expect(evaluate('=WORKDAY.INTL(DATE(2012,1,1),30,1/0)')).toEqual(divisionByZero);
    expect(evaluate('=WORKDAY.INTL(DATE(2012,1,1),30,B2)', { '1,1': divisionByZero })).toEqual(divisionByZero);
    expect(evaluate('=WORKDAY.INTL(DATE(2012,1,1),30,17)')).toBe(40944);
  });

  it('propagates formula errors from NETWORKDAYS.INTL weekend arguments', () => {
    const divisionByZero = createFormulaError(FormulaErrorCode.DivisionByZero);
    expect(evaluate('=NETWORKDAYS.INTL(DATE(2024,1,1),DATE(2024,1,5),1/0)')).toEqual(divisionByZero);
    expect(evaluate('=NETWORKDAYS.INTL(DATE(2024,1,1),DATE(2024,1,5),B2)', { '1,1': divisionByZero }))
      .toEqual(divisionByZero);
    expect(evaluate('=NETWORKDAYS.INTL(DATE(2024,1,1),DATE(2024,1,5),1)')).toBe(5);
  });

  it('rejects whitespace around seven-character weekend masks', () => {
    const invalid = createFormulaError(FormulaErrorCode.Value);
    expect(evaluate('=NETWORKDAYS.INTL(DATE(2024,1,1),DATE(2024,1,7)," 0000011 ")')).toEqual(invalid);
    expect(evaluate('=WORKDAY.INTL(DATE(2024,1,1),5," 0000011 ")')).toEqual(invalid);
    expect(evaluate('=NETWORKDAYS.INTL(DATE(2024,1,1),DATE(2024,1,7),"0000011")')).toBe(5);
  });

  it('returns Excel-compatible errors for invalid date/time inputs', () => {
    expect(evaluate('=DATEVALUE("not a date")')).toEqual(createFormulaError(FormulaErrorCode.Value));
    expect(evaluate('=WORKDAY.INTL(DATE(2012,1,1),30,0)')).toEqual(createFormulaError(FormulaErrorCode.Number));
    expect(evaluate('=WORKDAY.INTL(DATE(2024,1,1),1000,"1.5")')).toEqual(createFormulaError(FormulaErrorCode.Value));
    expect(evaluate('=NETWORKDAYS.INTL(DATE(1900,1,1),DATE(2447,7,31),"1.5")')).toEqual(
      createFormulaError(FormulaErrorCode.Value),
    );
    expect(evaluate('=NETWORKDAYS.INTL(DATE(2012,1,1),DATE(2012,1,2),"1111111")')).toEqual(
      createFormulaError(FormulaErrorCode.Number),
    );
    expect(evaluate('=NETWORKDAYS(1000000000000,DATE(2447,7,31))')).toEqual(
      createFormulaError(FormulaErrorCode.Number),
    );
    expect(evaluate('=WORKDAY(1000000000000,10)')).toEqual(createFormulaError(FormulaErrorCode.Number));
    expect(evaluate('=YEARFRAC("2012-1-1","2012-7-30",9)')).toEqual(createFormulaError(FormulaErrorCode.Number));
    expect(evaluate('=YEARFRAC(TRUE,"2030-12-31",1)')).toBeCloseTo(130.997262163518, 10);
    expect(evaluate('=YEARFRAC("2024-1-1",FALSE,1)')).toBeCloseTo(124.000700878288, 10);
    expect(evaluate('=YEARFRAC("2024-1-1","2030-12-31",1)')).toBeCloseTo(6.9972624168948, 12);
    expect(evaluate('=YEARFRAC(A1,"2030-12-31",1)', {}, {
      *iterateRangeCells() { yield { row: 0, col: 0, value: 0, source: 'empty' as const }; },
    })).toBe(131);
    expect(evaluate('=YEARFRAC(IF(TRUE,A1,0),"2030-12-31",1)')).toBe(131);
    expect(evaluate('=YEARFRAC("0","2030-12-31",1)')).toBe(131);
    expect(evaluate('=YEARFRAC(10,"2030-12-31",1)')).toBeCloseTo(130.972621635178, 10);
    expect(evaluate('=YEARFRAC("2024-1-1","1",1)')).toBeCloseTo(123.997963072475, 10);
    expect(evaluate('=YEARFRAC("2030-12-31",1)')).toBe(131);
    expect(evaluate('=YEARFRAC(45000,"2030-12-31",1)')).toBeCloseTo(7.79739904175222, 12);
  });

  it('returns WPS signed differences for reversed dates regardless of argument source', () => {
    expect(evaluate('=DATEDIF("2024-1-2","2024-1-1","D")')).toBe(-1);
    expect(evaluate('=DATEDIF("2001-1-1",0,"D")')).toBe(-36892);
    expect(evaluate('=DATEDIF("2001-1-1",FALSE,"D")')).toBe(-36892);
    expect(evaluate('=DATEDIF("2001-1-1","001","D")')).toBe(-36891);
    expect(evaluate('=DATEDIF("2001-1-1",A1,"D")', { '0,0': 0 })).toBe(-36892);
    expect(evaluate('=DATEDIF("2001-1-1",A1,"D")', { '0,0': false })).toBe(-36892);
    expect(evaluate('=DATEDIF("2001-1-1",IF(TRUE,A1,0),"D")', { '0,0': false })).toBe(-36892);
    expect(evaluate('=DATEDIF("2001-1-1",IF(TRUE,A1,0),"D")', { '0,0': '001' })).toBe(-36891);
    expect(evaluate('=DATEDIF("2001-1-1",A1,"M")', { '0,0': 0 })).toBe(-1212);
    expect(evaluate('=DATEDIF(1000,999,"D")')).toBe(-1);
    expect(evaluate('=DATEDIF(1000,A1,"D")', { '0,0': 999 })).toBe(-1);
    for (const [unit, expected] of [['M', 0], ['Y', 0], ['YM', 0], ['YD', -1], ['MD', -1]] as const) {
      expect(evaluate(`=DATEDIF(1000,999,"${unit}")`)).toBe(expected);
    }
    for (const [unit, expected] of [['D', -36], ['M', -1], ['Y', 0], ['YM', -1], ['YD', -36], ['MD', -5]] as const) {
      expect(evaluate(`=DATEDIF("2024-2-15","2024-1-10","${unit}")`)).toBe(expected);
    }
    expect(evaluate('=DATEDIF(1000,A1,"D")', { '0,0': 1001 })).toBe(1);
  });

  it('coerces boolean EOMONTH month offsets', () => {
    expect(evaluate('=EOMONTH("2024-1-31",FALSE)')).toBe(45322);
    expect(evaluate('=EOMONTH("2024-1-31",A1)', { '0,0': false })).toBe(45322);
    expect(evaluate('=EOMONTH("2024-1-31",IF(TRUE,A1,0))', { '0,0': false })).toBe(45322);
    expect(evaluate('=EOMONTH("2024-1-31",TRUE)')).toBe(45351);
  });

  it('coerces EDATE booleans and rejects serial zero', () => {
    const numberError = createFormulaError(FormulaErrorCode.Number);
    expect(evaluate('=EDATE(TRUE,120)')).toBe(3654);
    expect(evaluate('=EDATE(A1,120)', { '0,0': true })).toBe(3654);
    expect(evaluate('=EDATE("2024-1-31",FALSE)')).toBe(45322);
    expect(evaluate('=EDATE("2024-1-31",A1)', { '0,0': false })).toBe(45322);
    expect(evaluate('=EDATE(0,120)')).toEqual(numberError);
    expect(evaluate('=EDATE("0",120)')).toEqual(numberError);
    expect(evaluate('=EDATE(A1,120)', { '0,0': false })).toEqual(numberError);
    expect(evaluate('=EDATE("2024-1-31",1)')).toBe(45351);
  });

  it('coerces boolean WEEKNUM inputs before validating the week system', () => {
    expect(evaluate('=WEEKNUM(TRUE,21)')).toBe(52);
    expect(evaluate('=WEEKNUM(A1,21)', { '0,0': true })).toBe(52);
    expect(evaluate('=WEEKNUM(IF(TRUE,A1,0),21)', { '0,0': true })).toBe(52);
    const error = createFormulaError(FormulaErrorCode.Number);
    expect(evaluate('=WEEKNUM("2024-12-31",FALSE)')).toEqual(error);
    expect(evaluate('=WEEKNUM("2024-12-31",A1)', { '0,0': false })).toEqual(error);
  });

  it('rejects boolean workday dates and offsets', () => {
    const error = createFormulaError(FormulaErrorCode.Value);
    expect(evaluate('=WORKDAY.INTL(A1,1000,11)', { '0,0': true })).toEqual(error);
    expect(evaluate('=WORKDAY.INTL(DATE(2024,1,1),A1,11)', { '0,0': false })).toEqual(error);
    expect(evaluate('=NETWORKDAYS.INTL(TRUE,DATE(2447,7,31),11)')).toEqual(error);
    expect(evaluate('=NETWORKDAYS.INTL(A1,DATE(2447,7,31),11)', { '0,0': true })).toEqual(error);
    expect(evaluate('=NETWORKDAYS(A1,DATE(2447,7,31))', { '0,0': true })).toEqual(error);
  });

  it('handles workday offsets and accepts date text offsets', () => {
    expect(evaluate('=WORKDAY.INTL(DATE(2024,1,1),-0.5,11)')).toBe(45290);
    expect(evaluate('=WORKDAY.INTL(DATE(2024,1,1),FALSE,11)')).toBe(45292);
    expect(evaluate('=WORKDAY.INTL(TRUE,1000,11)')).toBe(1167);
    expect(evaluate('=DATE("",2,29)')).toEqual(createFormulaError(FormulaErrorCode.Value));
    expect(evaluate('=DATE(2024,"2024-02-29",29)')).toEqual(createFormulaError(FormulaErrorCode.Number));
    expect(evaluate('=DATE(2024,14,1)')).toBe(evaluate('=DATE(2025,2,1)'));
    expect(evaluate('=DATE(2024,-0.5,29)')).toBe(45259);
    expect(evaluate('=DATE(2024,A1,29)', { '0,0': -0.5 })).toBe(45259);
    expect(evaluate('=DATE(2024,-1e-12,29)')).toBe(45289);
    expect(evaluate('=DATE(2024,-0.5,1)')).toBe(45231);
    expect(evaluate('=DATE(2024,A1,1)', { '0,0': -0.5 })).toBe(45231);
    expect(evaluate('=DATE(2024,0,1)')).toBe(45261);
    expect(evaluate('=DATE(2024,A1,1)', { '0,0': 1.5 })).toBe(45292);
    expect(evaluate('=WORKDAY(DATE(2024,1,1),-2.675)')).toBe(45287);
    expect(evaluate('=WORKDAY(DATE(2024,1,2),-0.5)')).toBe(45292);
    expect(evaluate('=WORKDAY(DATE(2024,1,2),0)')).toBe(45293);
    expect(evaluate('=WORKDAY(DATE(2024,1,1),FALSE)')).toBe(45292);
    expect(evaluate('=WORKDAY(TRUE,1000)')).toBe(1399);
    expect(evaluate('=WORKDAY.INTL(DATE(2024,1,1),"2024-02-29",11)')).toBe(98201);
  });

  it('BUG-1011 rounds negative fractional WORKDAY offsets down', () => {
    expect(evaluate('=WORKDAY(DATE(2024,1,1),-2.675)')).toBe(45287);
    expect(evaluate('=WORKDAY(DATE(2024,1,1),-1.005)')).toBe(45288);
    expect(evaluate('=WORKDAY(DATE(2024,1,1),A1)', { '0,0': -2.675 })).toBe(45287);
    expect(evaluate('=WORKDAY(DATE(2024,1,1),IF(TRUE,A1,0))', { '0,0': -1.005 })).toBe(45288);
    expect(evaluate('=WORKDAY(DATE(2024,1,1),1.9)')).toBe(45293);
    expect(evaluate('=WORKDAY.INTL(DATE(2024,1,1),-0.5,11)')).toBe(45290);
  });

  it('BUG-1015 rounds negative fractional WORKDAY.INTL offsets down', () => {
    expect(evaluate('=WORKDAY.INTL(DATE(2024,1,1),-0.5,11)')).toBe(45290);
    expect(evaluate('=WORKDAY.INTL(DATE(2024,1,1),-1e-12,11)')).toBe(45290);
    expect(evaluate('=WORKDAY.INTL(DATE(2024,1,1),A1,11)', { '0,0': -0.5 })).toBe(45290);
    expect(evaluate('=WORKDAY.INTL(DATE(2024,1,1),IF(TRUE,A1,0),11)', { '0,0': -1e-12 })).toBe(45290);
    expect(evaluate('=WORKDAY.INTL(DATE(2024,1,1),1.5,11)')).toBe(45293);
    expect(evaluate('=WORKDAY.INTL(DATE(2024,1,1),0,11)')).toBe(45292);
  });

  it('maps selected weekend reference errors while preserving other argument errors', () => {
    const reference = createFormulaError(FormulaErrorCode.Reference);
    const name = createFormulaError(FormulaErrorCode.Name);
    const number = createFormulaError(FormulaErrorCode.Number);
    const value = createFormulaError(FormulaErrorCode.Value);
    const division = createFormulaError(FormulaErrorCode.DivisionByZero);
    const workday = '=WORKDAY.INTL(DATE(2024,1,1),1000,A1)';
    const networkdays = '=NETWORKDAYS.INTL(DATE(1900,1,1),DATE(2447,7,31),A1)';
    for (const source of [reference, name]) {
      expect(evaluate(workday, { '0,0': source })).toEqual(number);
      expect(evaluate('=WORKDAY.INTL(DATE(2024,1,1),1000,IF(TRUE,A1,1))', { '0,0': source }))
        .toEqual(number);
      expect(evaluate(networkdays, { '0,0': source })).toEqual(value);
      expect(evaluate('=NETWORKDAYS.INTL(DATE(1900,1,1),DATE(2447,7,31),IF(TRUE,A1,1))', { '0,0': source }))
        .toEqual(value);
    }
    expect(evaluate(networkdays, { '0,0': number })).toEqual(value);
    expect(evaluate(workday, { '0,0': division })).toEqual(division);
    expect(evaluate(networkdays, { '0,0': division })).toEqual(division);
    expect(evaluate('=WORKDAY.INTL(DATE(2024,1,1),1000,0)')).toEqual(number);
    expect(evaluate('=NETWORKDAYS.INTL(DATE(1900,1,1),DATE(2447,7,31),0)')).toEqual(number);
    expect(evaluate('=WORKDAY.INTL(DATE(2024,1,1),1000,1,A1)', { '0,0': reference }))
      .toEqual(reference);
    expect(evaluate('=NETWORKDAYS.INTL(DATE(2024,1,1),DATE(2024,1,5),1,A1)', { '0,0': reference }))
      .toEqual(reference);
    expect(evaluate('=WORKDAY(DATE(2024,1,1),1000,A1)', { '0,0': -1e12 })).toEqual(
      createFormulaError(FormulaErrorCode.Number),
    );
  });

  it('matches WPS TIME component boundaries and negative total validation', () => {
    expect(evaluate('=TIME(24,0,0)')).toBe(0);
    expect(evaluate('=TIME(-10,30,45)')).toEqual(createFormulaError(FormulaErrorCode.Number));
    expect(evaluate('=TIME(18,-61,45)')).toBeCloseTo((17 * 3600 - 60 + 45) / 86_400, 12);
    expect(evaluate('=TIME(18,-0.5,45)')).toBeCloseTo((18 * 3600 - 60 + 45) / 86_400, 12);
    expect(evaluate('=TIME(18,-1e-12,45)')).toBeCloseTo((18 * 3600 + 45) / 86_400, 12);
    expect(evaluate('=TIME(1,-30,0)')).toBeCloseTo(1800 / 86_400, 12);
    expect(evaluate('=TIME(1,0,-30)')).toBeCloseTo(3570 / 86_400, 12);
    expect(evaluate('=TIME(1,A1,0)', { '0,0': -30 })).toBeCloseTo(1800 / 86_400, 12);
    expect(evaluate('=TIME(1,30,0)')).toBe(0.0625);
    expect(evaluate('=TIME(0,-1,0)')).toEqual(createFormulaError(FormulaErrorCode.Number));
    expect(evaluate('=TIME(-1,60,0)')).toBe(0);
    expect(evaluate('=TIME(-1,120,0)')).toBeCloseTo(1 / 24, 12);
    expect(evaluate('=TIME(-32768,30,45)')).toEqual(createFormulaError(FormulaErrorCode.Number));
    expect(evaluate('=TIME(-32769,30,45)')).toBeCloseTo((7 * 3600 + 30 * 60 + 45) / 86_400, 12);
    expect(evaluate('=TIME(-1000000000000000,30,45)'))
      .toBeCloseTo((7 * 3600 + 30 * 60 + 45) / 86_400, 12);
    expect(evaluate('=TIME(18,-32768,45)')).toEqual(createFormulaError(FormulaErrorCode.Number));
    expect(evaluate('=TIME(18,-45000,45)')).toBeCloseTo((12 * 3600 + 7 * 60 + 45) / 86_400, 12);
    expect(evaluate('=TIME(18,0,-45000)')).toBeCloseTo((3 * 3600 + 6 * 60 + 7) / 86_400, 12);
    expect(evaluate('=TIME(32767,-32768,0)')).toBeCloseTo(0.53611111111104, 12);
    expect(evaluate('=TIME(45000,30,45)')).toEqual(createFormulaError(FormulaErrorCode.Number));
    expect(evaluate('=TIME(18,"2024-02-29",45)')).toEqual(createFormulaError(FormulaErrorCode.Number));
    expect(evaluate('=TIME("",30,45)')).toEqual(createFormulaError(FormulaErrorCode.Value));
    expect(evaluate('=TIME(A1,30,45)', { '0,0': '' })).toEqual(createFormulaError(FormulaErrorCode.Value));
    expect(evaluate('=TIME("1",30,45)')).toBeCloseTo((3600 + 30 * 60 + 45) / 86_400, 12);
  });

  it.each(['HOUR', 'MINUTE', 'SECOND'])('%s validates and coerces time serials', (name) => {
    expect(evaluate(`=${name}(-1)`)).toEqual(createFormulaError(FormulaErrorCode.Number));
    expect(evaluate(`=${name}(1000000000000)`)).toEqual(createFormulaError(FormulaErrorCode.Number));
    expect(evaluate(`=${name}("-1")`)).toEqual(createFormulaError(FormulaErrorCode.Number));
    expect(evaluate(`=${name}(TRUE)`)).toBe(0);
    expect(evaluate(`=${name}(FALSE)`)).toBe(0);
    expect(evaluate(`=${name}("1")`)).toBe(0);
    expect(evaluate(`=${name}("")`)).toEqual(createFormulaError(FormulaErrorCode.Value));
  });

  it('handles the zero date, booleans, and out-of-range date serials', () => {
    expect(evaluate('=DAY(0)')).toBe(0);
    expect(evaluate('=DAY("0")')).toBe(0);
    expect(evaluate('=MONTH(0)')).toBe(1);
    expect(evaluate('=MONTH("0")')).toBe(1);
    expect(evaluate('=YEAR(0)')).toBe(1900);
    expect(evaluate('=YEAR("0")')).toBe(1900);
    expect(evaluate('=DAY("-1")')).toEqual(createFormulaError(FormulaErrorCode.Number));
    expect(evaluate('=DAY(TRUE)')).toBe(1);
    expect(evaluate('=MONTH(TRUE)')).toBe(1);
    expect(evaluate('=YEAR(TRUE)')).toBe(1900);
    for (const value of ['-1000000000000000', '1000000000000']) {
      expect(evaluate(`=DAY(${value})`)).toEqual(createFormulaError(FormulaErrorCode.Number));
      expect(evaluate(`=MONTH(${value})`)).toEqual(createFormulaError(FormulaErrorCode.Number));
      expect(evaluate(`=YEAR(${value})`)).toEqual(createFormulaError(FormulaErrorCode.Number));
    }
  });

  it('registers every documented date/time function', () => {
    const registry = new FunctionRegistry();
    const names = [
      'DATE',
      'DATEDIF',
      'DATEVALUE',
      'DAY',
      'DAYS',
      'DAYS360',
      'EDATE',
      'EOMONTH',
      'HOUR',
      'ISOWEEKNUM',
      'MINUTE',
      'MONTH',
      'NETWORKDAYS',
      'NETWORKDAYS.INTL',
      'NOW',
      'SECOND',
      'TIME',
      'TIMEVALUE',
      'TODAY',
      'WEEKDAY',
      'WEEKNUM',
      'WORKDAY',
      'WORKDAY.INTL',
      'YEAR',
      'YEARFRAC',
    ];
    for (const name of names) expect(registry.get(name)).toBeDefined();
  });

  it('counts large business-day ranges without expanding formula arguments', () => {
    const start = performance.now();
    expect(evaluate('=NETWORKDAYS(DATE(1900,1,1),DATE(2447,7,31))')).toBe(142_858);
    expect(performance.now() - start).toBeLessThan(2_000);
  });
});
