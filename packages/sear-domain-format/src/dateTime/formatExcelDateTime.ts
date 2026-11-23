import { DefaultSpreadsheetFormatLocale, type SpreadsheetFormatLocale } from '../types/SpreadsheetFormatTypes';
import { excelDatePartsFromSerial } from './excelDatePartsFromSerial';

/** Formats an Excel date/time serial with date, clock, and elapsed-time tokens. */
export function formatExcelDateTime(
  serial: number,
  pattern = 'yyyy-m-d',
  locale: SpreadsheetFormatLocale = DefaultSpreadsheetFormatLocale,
): string | null {
  if (!Number.isFinite(serial) || serial < 0) return String(serial);
  const precision = fractionalSecondPrecision(pattern);
  const unit = Math.pow(10, precision);
  const roundedTotalSeconds = Math.round(serial * 86_400 * unit) / unit;
  const roundedSerial = roundedTotalSeconds / 86_400;
  const parts = excelDatePartsFromSerial(roundedSerial);
  if (!parts) return null;
  const daySeconds = positiveModulo(roundedTotalSeconds, 86_400);
  const hour = Math.floor(daySeconds / 3600);
  const minute = Math.floor((daySeconds % 3600) / 60);
  const second = Math.floor(daySeconds % 60);
  const secondFraction = daySeconds - Math.floor(daySeconds);
  const usesTwelveHourClock = hasMeridiemToken(pattern);
  const formatterLocale = locale.locale || DefaultSpreadsheetFormatLocale.locale;

  let result = '';
  for (let index = 0; index < pattern.length; ) {
    const literal = readLiteral(pattern, index);
    if (literal) {
      result += literal.text;
      index = literal.end;
      continue;
    }
    const token = readToken(pattern, index);
    if (!token) {
      result += pattern[index];
      index += 1;
      continue;
    }
    const lower = token.toLowerCase();
    if (lower === 'am/pm' || lower === 'a/p') {
      const marker = lower === 'a/p' ? (hour < 12 ? 'A' : 'P') : hour < 12 ? 'AM' : 'PM';
      result += token === token.toUpperCase() ? marker : marker.toLowerCase();
    } else if (lower === 'yyyy') result += String(parts.year).padStart(4, '0');
    else if (lower === 'yy') result += String(parts.year % 100).padStart(2, '0');
    else if (lower === 'b') result += String((parts.year + 543) % 100).padStart(2, '0');
    else if (lower === 'dddd') result += weekdayName(roundedSerial, formatterLocale, 'long');
    else if (lower === 'ddd') result += weekdayName(roundedSerial, formatterLocale, 'short');
    else if (lower === 'dd') result += String(parts.day).padStart(2, '0');
    else if (lower === 'd') result += String(parts.day);
    else if (lower === 'mmmmm') result += monthName(parts.month, formatterLocale, 'long').slice(0, 1);
    else if (lower === 'mmmm') result += monthName(parts.month, formatterLocale, 'long');
    else if (lower === 'mmm') result += monthName(parts.month, formatterLocale, 'short');
    else if (lower === '[h]') result += String(Math.floor(Math.abs(roundedTotalSeconds) / 3600));
    else if (lower === '[m]') result += String(Math.floor(Math.abs(roundedTotalSeconds) / 60));
    else if (lower === '[s]') result += String(Math.floor(Math.abs(roundedTotalSeconds)));
    else if (lower === 'hh' || lower === 'h') {
      const displayHour = usesTwelveHourClock ? hour % 12 || 12 : hour;
      result += lower === 'hh' ? String(displayHour).padStart(2, '0') : String(displayHour);
    } else if (lower === 'ss' || lower === 's') {
      result += lower === 'ss' ? String(second).padStart(2, '0') : String(second);
    } else if (lower === 'mm' || lower === 'm') {
      const value = isMinuteToken(pattern, index, token.length) ? minute : parts.month;
      result += lower === 'mm' ? String(value).padStart(2, '0') : String(value);
    } else if (/^\.0+$/.test(lower)) {
      const digits = lower.length - 1;
      result += `.${String(Math.round(secondFraction * Math.pow(10, digits))).padStart(digits, '0')}`;
    }
    index += token.length;
  }
  return serial < 0 && /\[[hms]\]/i.test(pattern) ? `-${result}` : result;
}

function readLiteral(pattern: string, index: number): { text: string; end: number } | null {
  const character = pattern[index];
  if (character === '"') {
    let text = '';
    let cursor = index + 1;
    while (cursor < pattern.length && pattern[cursor] !== '"') text += pattern[cursor++];
    return { text, end: Math.min(pattern.length, cursor + 1) };
  }
  if (character === '\\') return { text: pattern[index + 1] ?? '', end: Math.min(pattern.length, index + 2) };
  if (character === '_') return { text: ' ', end: Math.min(pattern.length, index + 2) };
  if (character === '*') return { text: '', end: Math.min(pattern.length, index + 2) };
  return null;
}

function readToken(pattern: string, index: number): string | null {
  return (
    /^(AM\/PM|A\/P|\[h\]|\[m\]|\[s\]|yyyy|mmmmm|mmmm|dddd|mmm|ddd|yy|hh|mm|dd|ss|\.0+|h|m|d|s|b)/i.exec(
      pattern.slice(index),
    )?.[0] ?? null
  );
}

function hasMeridiemToken(pattern: string): boolean {
  for (let index = 0; index < pattern.length; ) {
    const literal = readLiteral(pattern, index);
    if (literal) {
      index = literal.end;
      continue;
    }
    const token = readToken(pattern, index);
    if (token && /^(AM\/PM|A\/P)$/i.test(token)) return true;
    index += token?.length ?? 1;
  }
  return false;
}

function isMinuteToken(source: string, offset: number, length: number): boolean {
  const before = source
    .slice(0, offset)
    .replace(/"[^"]*"/g, '')
    .toLowerCase();
  const after = source
    .slice(offset + length)
    .replace(/"[^"]*"/g, '')
    .toLowerCase();
  return /(?:h+|\[h\]|s+|\[s\]):?$/.test(before) || /^:?s+/.test(after);
}

function fractionalSecondPrecision(pattern: string): number {
  for (let index = 0; index < pattern.length; ) {
    const literal = readLiteral(pattern, index);
    if (literal) {
      index = literal.end;
      continue;
    }
    const token = readToken(pattern, index);
    if (token?.startsWith('.')) return token.length - 1;
    index += token?.length ?? 1;
  }
  return 0;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function monthName(month: number, locale: string, width: 'short' | 'long'): string {
  return new Intl.DateTimeFormat(locale, { month: width, timeZone: 'UTC' }).format(
    new Date(Date.UTC(2020, month - 1, 1)),
  );
}

function weekdayName(serial: number, locale: string, width: 'short' | 'long'): string {
  const dateSerial = Math.floor(serial);
  const weekday = positiveModulo(dateSerial > 60 ? dateSerial - 1 : dateSerial, 7);
  const referenceSunday = Date.UTC(2023, 0, 1);
  return new Intl.DateTimeFormat(locale, { weekday: width, timeZone: 'UTC' }).format(
    new Date(referenceSunday + weekday * 86_400_000),
  );
}
