import {
  formatDollar,
  formatExcelDisplay,
  formatExcelDateTime,
  formatExcelText,
  formatFixed,
  formatSpreadsheetNumber,
  parseNumberValue,
} from '../src';

describe('spreadsheet format engine', () => {
  it('formats basic Excel number codes', () => {
    expect(formatSpreadsheetNumber(1234.5, '#,##0.00')).toBe('1,234.50');
    expect(formatSpreadsheetNumber(0.125, '0.0%')).toBe('12.5%');
    expect(formatSpreadsheetNumber(-1234.5, '#,##0.00;[Red](#,##0.00)')).toBe('(1,234.50)');
    expect(formatSpreadsheetNumber(0, '#,##0.00;[Red](#,##0.00);"-"')).toBe('-');
  });

  it('supports conditions, literals, escaped literals, and text sections', () => {
    expect(formatExcelText(42, '[>=10]"large";"small"')).toBe('large');
    expect(formatExcelText(4, '[>=10]"large";"small"')).toBe('small');
    expect(formatExcelText(5, '"[>10]"0;"second"0')).toBe('[>10]5');
    expect(formatExcelText(5, '"[>10]"0;0')).toBe('[>10]5');
    expect(formatExcelText(5, '[>10]0;"second"0')).toBe('second5');
    expect(formatExcelText(5, '\\[>10]0;0')).toBe('[>10]5');
    expect(formatExcelText('North', '0;0;0;"Region "@')).toBe('Region North');
    expect(formatExcelText('abc', '0.00')).toBe('abc');
    expect(formatExcelText('abc', '#,##0')).toBe('abc');
    expect(formatExcelText('abc', '0;0;0;@ "@"')).toBe('abc @');
    expect(formatExcelText('xyz', '0;0;0;@ "@"')).toBe('xyz @');
    expect(formatExcelText('abc', '0;0;0;@ \\@')).toBe('abc @');
    expect(formatExcelText('abc', '0"@"')).toBe('abc');
    expect(formatExcelText('abc', '0;0;0;@ "a""b"')).toBe('abc a"b');
    expect(formatExcelText(1, '0"a""b"')).toBe('1a"b');
    expect(formatExcelText(12, '\\#0_);* 0')).toBe('#12 ');
  });

  it('supports localized names, twelve-hour clocks, elapsed time, literals, and fractional seconds', () => {
    expect(formatExcelText(40944, 'dddd, mmmm d, yyyy')).toBe('Sunday, February 5, 2012');
    expect(formatExcelText(40944, 'DDDD')).toBe('Sunday');
    expect(formatExcelText(0, ' yy/mm/dd ')).toBe(' 00/01/00 ');
    expect(formatExcelText(-1e-12, '#,##0.00')).toBe('0.00');
    expect(
      formatExcelText(40944, 'dddd, mmmm d, yyyy', {
        locale: 'zh-CN',
        datePattern: 'yyyy-m-d',
        timePattern: 'h:mm:ss',
        dateTimePattern: 'yyyy-m-d h:mm:ss',
      }),
    ).toBe('\u661f\u671f\u65e5, \u4e8c\u6708 5, 2012');
    expect(formatExcelText(40777.6875, 'h:mm AM/PM')).toBe('4:30 PM');
    expect(formatExcelText(61.0006944444, 'ss:mm')).toBe('00:01');
    expect(formatExcelText(61.0006944444, 'mm:ss')).toBe('01:00');
    expect(formatExcelText(61.0013888889, 'ss:mm')).toBe('00:02');
    expect(formatExcelText(0.625, 'h "AM/PM"')).toBe('15 AM/PM');
    expect(formatExcelText(0.625, 'h AM/PM')).toBe('3 PM');
    expect(formatExcelText(0.625, 'h \\A/P')).toBe('15 A/P');
    expect(formatExcelText(1.5, '[h]:mm:ss')).toBe('36:00:00');
    expect(formatExcelText(0.5, 'h:mm:ss.00')).toBe('12:00:00.00');
    expect(formatExcelText(40944, '"Month "m')).toBe('Month 2');
    expect(formatExcelText(40944, '[$-409]mmmm d')).toBe('February 5');
    expect(formatExcelText(3, '[$-804]yyyy-mm-dd dddd')).toBe('1900-01-03 \u661f\u671f\u4e09');
  });

  it('preserves selected color and fill metadata', () => {
    expect(formatExcelDisplay(-12, '[Red][<0]0.00;[Blue]0.00')).toEqual({
      text: '-12.00',
      color: '#ff0000',
    });
    expect(formatExcelDisplay(12, '$* #,##0.00')).toEqual({
      text: '$ 12.00',
      fillCharacter: ' ',
    });
    expect(formatExcelDisplay(5, '0"[Red]"')).toEqual({ text: '5[Red]' });
  });

  it('distinguishes literal percent signs and supports engineering exponent layouts', () => {
    expect(formatExcelText(12, '0"%"')).toBe('12%');
    expect(formatExcelText(0.12, '0%')).toBe('12%');
    expect(formatExcelText(0.25, '0%"kg"')).toBe('25%kg');
    expect(formatExcelText(0.25, '%0')).toBe('%25');
    expect(formatExcelText(0.25, '0%0')).toBe('2%5');
    expect(formatExcelText(0.25, '"%"0')).toBe('%0');
    expect(formatExcelText(0.25, '\\%0')).toBe('%0');
    expect(formatExcelText(12_200_000, '#0.0E+0')).toBe('12.2E+6');
    expect(formatExcelText(1234.5, '[$$-409]#,##0.00')).toBe('$1,234.50');
    expect(formatExcelText(1234.5, '1.005')).toBe('11234.505');
    expect(formatExcelText(1234.5, '-1.005')).toBe('-11234.505');
    expect(formatExcelText(1234.5, '2.675')).toBe('21235.675');
    expect(formatExcelText(1234.5, '-2.675')).toBe('-21235.675');
    expect(formatExcelText(1234.5, 'abc')).toBe('a46c');
  });

  it('preserves bare format digits around numeric placeholders', () => {
    expect(formatExcelText(5, '2.3')).toBe('25.3');
    expect(formatExcelText(5, '100')).toBe('105');
    expect(formatExcelText(5, '1.0')).toBe('15.0');
    expect(formatExcelText(5, '00')).toBe('05');
    expect(formatExcelText(5, '"1"0')).toBe('15');
  });

  it('formats date/time serials and exposes the shared date helper', () => {
    expect(formatSpreadsheetNumber(40944, 'm/dd/yyyy')).toBe('2/05/2012');
    expect(formatSpreadsheetNumber(40777.5, 'yyyy-m-d h:mm:ss')).toBe('2011-8-22 12:00:00');
    expect(formatExcelDateTime(60, 'yyyy-m-d')).toBe('1900-2-29');
    expect(formatExcelText(61.9999999, 'yyyy-mm-dd hh:mm:ss')).toBe('1900-03-02 00:00:00');
    expect(formatExcelText(61.99999, 'yyyy-mm-dd hh:mm:ss')).toBe('1900-03-01 23:59:59');
    expect(formatExcelText(61.9999999, 'ddd, yyyy-mm-dd hh:mm:ss')).toBe('Fri, 1900-03-02 00:00:00');
    expect(formatExcelText(59.9999999, 'yyyy-mm-dd hh:mm:ss')).toBe('1900-02-29 00:00:00');
    expect(formatExcelText(61.9999999, 'hh:mm:ss ".00"')).toBe('00:00:00 .00');
    expect(formatExcelText(61.9999999, 'hh:mm:ss')).toBe('00:00:00');
    expect(formatExcelText(61.9999999, 'hh:mm:ss.00')).toBe('23:59:59.99');
    expect(formatExcelText(2_958_465, 'yyyy-mm-dd')).toBe('9999-12-31');
    expect(formatExcelText(2_958_466, 'yyyy-mm-dd')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(formatExcelText(2_958_465.9999999, 'yyyy-mm-dd hh:mm:ss')).toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('supports thousand scaling, scientific notation, and fractions', () => {
    expect(formatSpreadsheetNumber(1234567, '#,##0,')).toBe('1,235');
    expect(formatSpreadsheetNumber(12345, '0.00E+00')).toBe('1.23E+04');
    expect(formatExcelText(9.99, '0.0E+00')).toBe('1.0E+01');
    expect(formatExcelText(9.94, '0.0E+00')).toBe('9.9E+00');
    expect(formatExcelText(-9.99, '0.0E+00')).toBe('-1.0E+01');
    expect(formatExcelText(99.99, '#0.0E+0')).toBe('1.0E+2');
    expect(formatExcelText(5e-324, '0.0E+00')).toBe('4.9E-324');
    expect(formatExcelText(1, '0#')).toBe('01');
    expect(formatExcelText(12, '0#')).toBe('12');
    expect(formatExcelDisplay(1, '[Color1]0')).toEqual({ text: '1', color: '#000000' });
    expect(formatExcelDisplay(1, '[Color17]0')).toEqual({ text: '1', color: '#9999ff' });
    expect(formatExcelDisplay(1, '[Color56]0')).toEqual({ text: '1', color: '#333333' });
    expect(formatSpreadsheetNumber(1.25, '# ?/?')).toBe('1 1/4');
    expect(formatSpreadsheetNumber(0.125, '#/##')).toBe('1/8');
    expect(formatExcelText(0.2, '?/0')).toBe('1/5');
    expect(formatExcelText(0.5, '?/0')).toBe('1/2');
    expect(formatExcelText(0.5, '?/16')).toBe('8/16');
  });

  it('preserves question-mark alignment spaces in fraction text', () => {
    expect(formatExcelText(0, '# ?/?')).toBe('0    ');
    expect(formatExcelText(-0.5, '# ?/?')).toBe('- 1/2');
    expect(formatExcelText(0.5, '# ?/16')).toBe(' 8/16');
    expect(formatExcelText(1.25, '# ?/?')).toBe('1 1/4');
    expect(formatExcelText(0.5, '??/??')).toBe(' 1/ 2');
  });

  it('rejects decimal precision beyond the formatter limit', () => {
    expect(formatExcelText(1, `0.${'0'.repeat(101)}`)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(formatExcelText(1, `0.${'0'.repeat(100)}`)).toHaveLength(102);
    expect(formatExcelText(1, `0.${'0'.repeat(101)}E+00`)).toEqual({ kind: 'error', code: '#VALUE!' });
  });

  it('keeps significant integer digits when formatting large fixed decimals', () => {
    expect(formatExcelText(1e20, '0.00')).toBe('100000000000000000000.00');
    expect(formatExcelText(1e21, '0.00')).toBe('1000000000000000000000.00');
    expect(formatExcelText(1e22, '0.00')).toBe('10000000000000000000000.00');
    expect(formatExcelText(1e21, '#,##0')).toBe('1,000,000,000,000,000,000,000');
    expect(formatExcelText(-1e21, '#,##0')).toBe('-1,000,000,000,000,000,000,000');
  });

  it('keeps large FIXED and DOLLAR values instead of rounding them down', () => {
    expect(formatFixed(1e20, 2, false)).toBe('100,000,000,000,000,000,000.00');
    expect(formatFixed(1e21, 2, false)).toBe('1,000,000,000,000,000,000,000.00');
    expect(formatFixed(1e21, 2, true)).toBe('1000000000000000000000.00');
    expect(formatFixed(1e21, -2, false)).toBe('1,000,000,000,000,000,000,000');
    expect(formatDollar(1e21, 2)).toBe('$1,000,000,000,000,000,000,000.00');
    expect(formatDollar(-1e21, 2)).toBe('($1,000,000,000,000,000,000,000.00)');
  });

  it('decodes literals between integer placeholders', () => {
    expect(formatExcelText(12, '0-0')).toBe('1-2');
    expect(formatExcelText(12, '0"x"0')).toBe('1x2');
    expect(formatExcelText(12, '0\\x0')).toBe('1x2');
    expect(formatExcelText(12, '0"a""b"0')).toBe('1a"b2');
    expect(formatExcelText(12, '0_00')).toBe('1 2');
    expect(formatExcelText(34, '0_00')).toBe('3 4');
  });

  it('rejects non-finite values created by format scaling', () => {
    expect(formatExcelText(1e307, '0%')).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(formatExcelText(1e307, '0.0E+00')).toBe('1.0E+307');
  });

  it('formats fixed, dollar, and locale-aware numbervalue parsing', () => {
    expect(formatDollar(-1234.5, 1)).toBe('($1,234.5)');
    expect(formatFixed(1234.567, 2, false)).toBe('1,234.57');
    expect(parseNumberValue('1.234,5%', ',', '.')).toBe(12.345);
    expect(parseNumberValue('bad')).toBeNull();
  });

  it('limits entered numbers to 15 significant decimal digits', () => {
    expect(parseNumberValue('1234567890123456')).toBe(1234567890123450);
    expect(parseNumberValue('1.234567890123456')).toBe(1.23456789012345);
    expect(parseNumberValue('0.00001234567890123456')).toBe(0.0000123456789012345);
    expect(parseNumberValue('1.234.567.890.123.456', ',', '.')).toBe(1234567890123450);
  });
});
