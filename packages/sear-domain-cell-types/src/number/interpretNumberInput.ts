import { parseNumberValue } from '@searsuite/sear-domain-format';
import { type CellFormat, type CellFormatLocale, CellFormats, DefaultCellFormatLocale, normalizeCellFormat, parseFormattedNumber } from '../CellFormat';
import { type CellMatrixElement } from '../CellMatrixElement';
import { CellType } from '../CellType';

/** Parses direct numeric/date input and suggests a display format for General cells. */
export function interpretNumberInput(
  source: string,
  currentFormat: CellFormat | null | undefined,
  locale: CellFormatLocale = DefaultCellFormatLocale,
  previous?: CellMatrixElement | null,
): { value: number; format?: CellFormat } | null {
  const text = source.trim();
  const format = normalizeCellFormat(currentFormat);
  if (format.kind !== 'general') {
    if (format.kind === 'percent' && previous?.type === CellType.Number && !text.includes('%')) {
      const value = parseFormattedNumber(text, CellFormats.general, locale);
      return value === undefined ? null : { value, format: CellFormats.general };
    }
    if (format.kind === 'date' || format.kind === 'dateTime') {
      const date = parseDateTime(text);
      if (date?.format.kind === 'date') return { value: date.value };
    }
    const value = parseFormattedNumber(text, currentFormat, locale);
    return value === undefined ? null : { value };
  }
  const date = parseDateTime(text);
  if (date) return date;
  if (/^\$[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) {
    const value = parseNumberValue(text.slice(1));
    if (value !== null) return { value, format: { kind: 'currency', currency: 'USD' } };
  }
  if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%$/.test(text)) {
    const value = parseNumberValue(text);
    if (value !== null) return { value, format: { kind: 'percent', maximumFractionDigits: (text.match(/\.(\d+)/)?.[1].length ?? 0) } };
  }
  if (/^[+-]?\d{1,3}(,\d{3})+(?:\.\d+)?$/.test(text)) {
    const value = parseNumberValue(text);
    if (value !== null) return { value, format: { kind: 'number', useGrouping: true } };
  }
  const value = parseFormattedNumber(text, currentFormat, locale);
  return value === undefined ? null : { value };
}

function parseDateTime(text: string): { value: number; format: CellFormat } | null {
  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (clock) {
    const [hour, minute, second] = clock.slice(1).map((part) => Number(part ?? 0));
    if (hour > 23 || minute > 59 || second > 59) return null;
    return { value: (hour * 3600 + minute * 60 + second) / 86400, format: { kind: 'time', pattern: clock[3] ? 'h:mm:ss' : 'h:mm' } };
  }
  const yearFirst = /^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})$/.exec(text);
  const chinese = /^(\d{4})\u5e74(\d{1,2})\u6708(\d{1,2})\u65e5$/.exec(text);
  const monthFirst = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (!yearFirst && !chinese && !monthFirst) return null;
  const year = Number(yearFirst?.[1] ?? chinese?.[1] ?? monthFirst?.[3]);
  const month = Number(yearFirst?.[3] ?? chinese?.[2] ?? monthFirst?.[1]);
  const day = Number(yearFirst?.[4] ?? chinese?.[3] ?? monthFirst?.[2]);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  const dayCount = Math.round((timestamp - Date.UTC(1899, 11, 31)) / 86400000);
  const value = dayCount + (timestamp >= Date.UTC(1900, 2, 1) ? 1 : 0);
  const pattern = yearFirst?.[2] === '-' ? 'yyyy-mm-dd' : yearFirst?.[2] === '/' ? 'yyyy/m/d'
    : yearFirst?.[2] === '.' ? 'yyyy.m.d' : chinese ? 'yyyy-m-d' : 'm/d/yyyy';
  return { value, format: { kind: 'date', pattern } };
}
