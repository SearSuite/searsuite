import {
  adjustCellFormatDecimalPlaces,
  CellFormats,
  cellFormatToExcelCode,
  createGeneralNumberDisplayCandidates,
  formatCellNumber,
  formatCellNumberForEditor,
  formatCellNumberForFormulaBar,
  normalizeCellFormat,
  parseFormattedNumber,
} from '../src';

describe('cell formats', () => {
  it('provides date and percentage text for their editing surfaces', () => {
    expect(formatCellNumberForFormulaBar(45351, { kind: 'date', pattern: 'yyyy-mm-dd' })).toBe('2024/2/29');
    expect(formatCellNumberForEditor(45351, { kind: 'date', pattern: 'yyyy-mm-dd' })).toBe('2024/2/29');
    expect(formatCellNumberForFormulaBar(0.25, CellFormats.percent)).toBe('0.25');
    expect(formatCellNumberForEditor(0.25, CellFormats.percent)).toBe('25%');
  });

  it('adjusts decimal places without changing nonnumeric format families', () => {
    expect(adjustCellFormatDecimalPlaces(CellFormats.general, 1)).toEqual({
      kind: 'number',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      useGrouping: false,
    });
    expect(adjustCellFormatDecimalPlaces(CellFormats.currency('USD', 'en-US'), -1)).toEqual({
      kind: 'currency',
      currency: 'USD',
      locale: 'en-US',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    expect(adjustCellFormatDecimalPlaces(CellFormats.date, 1)).toEqual(CellFormats.date);
  });

  it('orders General display candidates for precision reduction and scientific fallback', () => {
    expect(createGeneralNumberDisplayCandidates(1234.567)[0]).toBe('1234.567');
    expect(createGeneralNumberDisplayCandidates(1234.567)).toContain('1234.57');
    expect(createGeneralNumberDisplayCandidates(123_456_789_012)[0]).toMatch(/E11$/);
  });

  it('normalizes explicit format objects without accepting legacy or malformed values', () => {
    expect(normalizeCellFormat('@')).toEqual(CellFormats.general);
    expect(normalizeCellFormat('%')).toEqual(CellFormats.general);
    expect(normalizeCellFormat({ kind: 'currency', currency: 'USD' })).toEqual({
      kind: 'currency',
      currency: 'USD',
    });
    expect(normalizeCellFormat({ kind: 'excelCode', code: '#,##0.00' })).toEqual({
      kind: 'excelCode',
      code: '#,##0.00',
    });
    expect(normalizeCellFormat({ kind: 'currency' })).toEqual(CellFormats.general);
    expect(normalizeCellFormat({ kind: 'unknown' })).toEqual(CellFormats.general);
    expect(normalizeCellFormat('unknown-string')).toEqual(CellFormats.general);
    expect(normalizeCellFormat('text')).toEqual(CellFormats.general);
    expect(normalizeCellFormat('number')).toEqual(CellFormats.general);
    expect(normalizeCellFormat('percent')).toEqual(CellFormats.general);

    // Line 45 cases
    expect(normalizeCellFormat(null)).toEqual(CellFormats.general);
    expect(normalizeCellFormat(undefined)).toEqual(CellFormats.general);
    expect(normalizeCellFormat(123)).toEqual(CellFormats.general);
    expect(normalizeCellFormat({})).toEqual(CellFormats.general);
  });

  it('parses and formats numbers according to explicit display semantics', () => {
    expect(parseFormattedNumber(' 1.25e2 ', CellFormats.general)).toBe(125);
    expect(parseFormattedNumber('12.5%', CellFormats.percent)).toBe(0.125);
    expect(parseFormattedNumber('$1,234.50', { kind: 'currency', currency: 'USD' })).toBe(1234.5);
    expect(
      parseFormattedNumber('(1.234,50 €)', CellFormats.currency('EUR'), {
        locale: 'de-DE',
        datePattern: 'dd.mm.yyyy',
        timePattern: 'hh:mm:ss',
        dateTimePattern: 'dd.mm.yyyy hh:mm:ss',
        decimalSeparator: ',',
        groupSeparator: '.',
      }),
    ).toBe(-1234.5);
    expect(parseFormattedNumber('12px', CellFormats.general)).toBeUndefined();

    // Line 57 case: empty string
    expect(parseFormattedNumber('', CellFormats.number)).toBeUndefined();
    expect(parseFormattedNumber('   ', CellFormats.number)).toBeUndefined();

    // Line 61 & 90 cases: invalid strings
    expect(parseFormattedNumber('abc', CellFormats.number)).toBeUndefined();

    // Line 92 case: non-finite
    expect(parseFormattedNumber('1e1000', CellFormats.number)).toBeUndefined();

    expect(formatCellNumber(0.125, { kind: 'percent', minimumFractionDigits: 1 })).toBe('12.5%');
    expect(
      formatCellNumber(1234.5, {
        kind: 'number',
        locale: 'en-US',
        useGrouping: true,
      }),
    ).toBe('1,234.5');
    expect(
      formatCellNumber(1234.5, {
        kind: 'currency',
        currency: 'USD',
        locale: 'en-US',
      }),
    ).toBe('$1,234.50');
    expect(formatCellNumber(Number.NaN, CellFormats.number)).toBe('NaN');
  });

  it('delegates Excel format code display to the shared format engine', () => {
    expect(formatCellNumber(1234.5, CellFormats.excelCode('#,##0.00'))).toBe('1,234.50');
    expect(formatCellNumber(-1234.5, CellFormats.excelCode('#,##0.00;[Red](#,##0.00)'))).toBe('(1,234.50)');
    expect(formatCellNumber(12345, CellFormats.excelCode('0.00E+00'))).toBe('1.23E+04');
    expect(formatCellNumber(1.25, CellFormats.excelCode('# ?/?'))).toBe('1 1/4');
  });

  it('formats Excel date and time serials using explicit date formats', () => {
    expect(formatCellNumber(40777, CellFormats.date)).toBe('2011-8-22');
    expect(formatCellNumber(40944, { kind: 'date', pattern: 'm/dd/yyyy' })).toBe('2/05/2012');
    expect(formatCellNumber(0.5, CellFormats.time)).toBe('12:00:00');
    expect(formatCellNumber(40777.5, CellFormats.dateTime)).toBe('2011-8-22 12:00:00');
    expect(normalizeCellFormat('date')).toEqual(CellFormats.general);
    expect(normalizeCellFormat('datetime')).toEqual(CellFormats.general);
  });

  it('uses cell-format locale defaults when formats omit locale-specific settings', () => {
    const chineseLocale = {
      locale: 'zh-CN',
      datePattern: 'yyyy\u5e74m\u6708d\u65e5',
      timePattern: 'h:mm:ss',
      dateTimePattern: 'yyyy\u5e74m\u6708d\u65e5 h:mm:ss',
    };

    expect(formatCellNumber(40777, CellFormats.date, chineseLocale)).toBe('2011\u5e748\u670822\u65e5');
    expect(formatCellNumber(40777.5, CellFormats.dateTime, chineseLocale)).toBe('2011\u5e748\u670822\u65e5 12:00:00');
    expect(formatCellNumber(1234.5, { kind: 'number', useGrouping: true }, { ...chineseLocale, locale: 'de-DE' })).toBe(
      '1.234,5',
    );
    expect(formatCellNumber(40944, { kind: 'date', pattern: 'm/dd/yyyy' }, chineseLocale)).toBe('2/05/2012');
    expect(formatCellNumber(1234.5, { kind: 'number', locale: 'en-US', useGrouping: true }, chineseLocale)).toBe(
      '1,234.5',
    );
  });

  it('creates currency format objects', () => {
    expect(CellFormats.currency('USD')).toEqual({ kind: 'currency', currency: 'USD' });
    expect(CellFormats.currency('EUR', 'de-DE')).toEqual({ kind: 'currency', currency: 'EUR', locale: 'de-DE' });
  });

  it('projects every structured format into formula-visible Excel codes', () => {
    expect(cellFormatToExcelCode(null)).toBeUndefined();
    expect(cellFormatToExcelCode(CellFormats.text)).toBe('@');
    expect(cellFormatToExcelCode({ kind: 'number', minimumFractionDigits: 1, maximumFractionDigits: 3 })).toBe(
      '#,##0.0##',
    );
    expect(cellFormatToExcelCode({ kind: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe(
      '0.00%',
    );
    expect(cellFormatToExcelCode(CellFormats.currency('USD'))).toBe('"USD" #,##0');
  });
});
