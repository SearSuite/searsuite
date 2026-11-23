import {
  currentExcelDateTimeSerial,
  ChineseExcelDateTimeLocale,
  createExcelDateTimeLocale,
  EnglishExcelDateTimeLocale,
  excelDatePartsFromSerial,
  excelSerialFromDateParts,
  excelTimeFraction,
  formatExcelDateTime,
  parseExcelDate,
  parseExcelDateTime,
  parseExcelTime,
  unixMillisToExcelSerial,
} from '../src/functions/dateTime';

describe('date/time formula shared utilities', () => {
  it('converts between Excel 1900 serials and Gregorian date parts', () => {
    expect(excelSerialFromDateParts(2011, 8, 22)).toBe(40777);
    expect(excelSerialFromDateParts(1900, 1, 1)).toBe(1);
    expect(excelDatePartsFromSerial(40777)).toEqual({ year: 2011, month: 8, day: 22 });
  });

  it('preserves Excel 1900 leap-day compatibility', () => {
    expect(excelSerialFromDateParts(1900, 2, 29)).toBe(60);
    expect(excelDatePartsFromSerial(60)).toEqual({ year: 1900, month: 2, day: 29, phantomLeapDay: true });
    expect(excelDatePartsFromSerial(61)).toEqual({ year: 1900, month: 3, day: 1 });
  });

  it('parses common date text formats used by the imported Excel examples', () => {
    expect(parseExcelDate('2011-8-22')).toBe(40777);
    expect(parseExcelDate('22-MAY-2011')).toBe(40685);
    expect(parseExcelDate('2011/02/23')).toBe(40597);
    expect(parseExcelDate('2024-02-30')).toBeNull();
    expect(parseExcelDate('2024-13-01')).toBeNull();
    expect(parseExcelDate('2024-02-29')).not.toBeNull();
    expect(parseExcelDate('1900-02-29')).toBe(60);
    expect(parseExcelDate('2021 年 12 月 31 日')).toBeNull();
    expect(parseExcelDate('5-JUL', { currentDateTime: Date.UTC(2008, 0, 1) })).toBe(39634);
  });

  it('applies the Excel two-digit year cutoff only to date text', () => {
    for (const [text, year] of [
      ['1/1/00', 2000],
      ['1/1/19', 2019],
      ['1/1/29', 2029],
      ['1/1/30', 1930],
      ['1/1/99', 1999],
      ['1-JAN-19', 2019],
      ['1-JAN-30', 1930],
    ] as const) {
      expect(parseExcelDate(text)).toBe(excelSerialFromDateParts(year, 1, 1));
    }
    expect(parseExcelDate('1/1/2019')).toBe(excelSerialFromDateParts(2019, 1, 1));
  });

  it('parses time text and date-time text with the default English symbols', () => {
    expect(parseExcelTime('2:24 AM')).toBeCloseTo(0.1, 12);
    expect(parseExcelTime('13:00 PM')).toBeNull();
    expect(parseExcelTime('00:30 PM')).toBeNull();
    expect(parseExcelTime('13:00')).toBeCloseTo(13 / 24, 12);
    expect(parseExcelTime('下午 12:45:00')).toBeNull();

    const parsed = parseExcelDateTime('2011-8-22 6:35 AM');
    expect(parsed?.hasDate).toBe(true);
    expect(parsed?.hasTime).toBe(true);
    expect(parsed?.serial).toBeCloseTo(40777 + 395 / 1440, 12);
  });

  it('supports explicit Chinese date/time symbols with English fallback', () => {
    expect(parseExcelDate('22-MAY-2011', { locale: EnglishExcelDateTimeLocale })).toBe(40685);
    expect(parseExcelDate('2021 年 12 月 31 日', { locale: EnglishExcelDateTimeLocale })).toBeNull();
    expect(parseExcelDate('2021 年 12 月 31 日', { locale: ChineseExcelDateTimeLocale })).toBe(44561);
    expect(parseExcelTime('下午 12:45:00', { locale: ChineseExcelDateTimeLocale })).toBeCloseTo(0.53125, 12);
    expect(parseExcelTime('2:24 AM', { locale: ChineseExcelDateTimeLocale })).toBeCloseTo(0.1, 12);
  });

  it('builds third-party date/time locales from registered symbols', () => {
    const japaneseLocale = createExcelDateTimeLocale({
      locale: 'ja-JP',
      symbols: {
        units: {
          year: ['年'],
          month: ['月'],
          day: ['日'],
        },
        meridiems: [
          { text: '午前', period: 'am' },
          { text: '午後', period: 'pm' },
        ],
      },
    });

    expect(parseExcelDate('2024年3月14日', { locale: japaneseLocale })).toBe(45365);
    expect(parseExcelTime('午後 1:30', { locale: japaneseLocale })).toBeCloseTo(13.5 / 24, 12);
    expect(parseExcelDate('14-MAR-2024', { locale: japaneseLocale })).toBe(45365);
  });

  it('formats date and time serials with simple Excel-style patterns', () => {
    expect(formatExcelDateTime(40944, 'm/dd/yyyy')).toBe('2/05/2012');
    expect(formatExcelDateTime(40777 + 0.5, 'yyyy-m-d h:mm:ss')).toBe('2011-8-22 12:00:00');
  });

  it('uses EvalContext currentDateTime for deterministic volatile date functions', () => {
    const epochMs = Date.UTC(2030, 0, 1, 12, 0, 0);
    expect(unixMillisToExcelSerial(epochMs)).toBe(47484.5);
    expect(
      currentExcelDateTimeSerial({
        currentDateTime: () => epochMs,
        isCellInBounds: () => true,
        getCellValue: () => 0,
        iterateRange: () => [],
      }),
    ).toBe(47484.5);
  });

  it('normalizes overflowing time parts to a day fraction', () => {
    expect(excelTimeFraction(25, 0, 0)).toBeCloseTo(1 / 24, 12);
  });
});
