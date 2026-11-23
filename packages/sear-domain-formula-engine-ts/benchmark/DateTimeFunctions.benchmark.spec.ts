/** @jest-environment node */

import { benchmarkFormula } from './benchmarkUtils';
import { dateTimeBenchmarkNames } from './dateTimeBenchmarkNames';

const cases: ReadonlyArray<readonly [string, string]> = [
  ['DATE', '=DATE(2024,2,29)'],
  ['DATEDIF', '=DATEDIF("2001-1-1","2031-12-31","D")'],
  ['DATEVALUE', '=DATEVALUE("2024-2-29")'],
  ['DAY', '=DAY("2024-2-29")'],
  ['DAYS', '=DAYS("2030-1-1","2024-1-1")'],
  ['DAYS360', '=DAYS360("2024-1-1","2030-12-31")'],
  ['EDATE', '=EDATE("2024-1-31",120)'],
  ['EOMONTH', '=EOMONTH("2024-1-31",120)'],
  ['HOUR', '=HOUR("2024-1-1 18:30:45")'],
  ['ISOWEEKNUM', '=ISOWEEKNUM("2024-12-31")'],
  ['MINUTE', '=MINUTE("2024-1-1 18:30:45")'],
  ['MONTH', '=MONTH("2024-2-29")'],
  ['NETWORKDAYS', '=NETWORKDAYS(DATE(1900,1,1),DATE(2447,7,31))'],
  ['NETWORKDAYS.INTL', '=NETWORKDAYS.INTL(DATE(1900,1,1),DATE(2447,7,31),11)'],
  ['NOW', '=NOW()'],
  ['SECOND', '=SECOND("2024-1-1 18:30:45")'],
  ['TIME', '=TIME(18,30,45)'],
  ['TIMEVALUE', '=TIMEVALUE("18:30:45")'],
  ['TODAY', '=TODAY()'],
  ['WEEKDAY', '=WEEKDAY("2024-2-29",2)'],
  ['WEEKNUM', '=WEEKNUM("2024-12-31",21)'],
  ['WORKDAY', '=WORKDAY(DATE(2024,1,1),1000)'],
  ['WORKDAY.INTL', '=WORKDAY.INTL(DATE(2024,1,1),1000,11)'],
  ['YEAR', '=YEAR("2024-2-29")'],
  ['YEARFRAC', '=YEARFRAC("2024-1-1","2030-12-31",1)'],
];

describe('date/time function performance coverage', () => {
  it('has one measured path for every documented date/time function', () => {
    expect(cases.map(([name]) => name).sort()).toEqual([...dateTimeBenchmarkNames].sort());
  });

  it.each(cases)('%s stays within the configured threshold', (_name, formula) => {
    benchmarkFormula(formula);
  });
});
