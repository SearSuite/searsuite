/** Shared Excel-compatible date/time serial parsing and formatting helpers. */
import {
  type EvalContext,
  type FormulaDateTimeLocale,
  type FormulaDateTimeParseOptions,
  type FormulaDateTimeParseResult,
  type FormulaDateTimeSymbols,
  type FormulaTextLocale,
  type IFormulaLocaleProvider,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { CjkFormulaTextLocale } from '../../text/dbcsTextLocale';
import {
  BuiltInExcelDateTimeLocaleId,
  ChineseExcelDateTimeSymbols,
  EnglishExcelDateTimeSymbols,
  type BuiltInExcelDateTimeLocaleId as BuiltInExcelDateTimeLocaleIdType,
} from './excelDateTimeSymbols';

const DAY_MS = 86_400_000;
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 31);
export const EXCEL_1904_SERIAL_OFFSET = 1462;

interface NormalizedDateTimeSymbols {
  readonly months: ReadonlyMap<string, number>;
  readonly meridiems: ReadonlyMap<string, 'am' | 'pm'>;
  readonly yearUnits: readonly string[];
  readonly monthUnits: readonly string[];
  readonly dayUnits: readonly string[];
  readonly meridiemPattern: RegExp | null;
  readonly unitDatePattern: RegExp | null;
}

export interface ExcelDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly phantomLeapDay?: boolean;
}

export interface ParsedExcelDateTime {
  readonly serial: number;
  readonly hasDate: boolean;
  readonly hasTime: boolean;
}

export interface ExcelDateTimeParseOptions extends FormulaDateTimeParseOptions {
  readonly locale?: FormulaDateTimeLocale;
}

const EnglishExcelDateTimeResolvedSymbols = normalizeDateTimeSymbols(EnglishExcelDateTimeSymbols);

/** English Excel-style date/time text parser and formatter. */
export const EnglishExcelDateTimeLocale = createExcelDateTimeLocale({
  locale: BuiltInExcelDateTimeLocaleId.English,
  symbols: EnglishExcelDateTimeSymbols,
});

/** Chinese Excel-style date/time text parser and formatter. */
export const ChineseExcelDateTimeLocale = createExcelDateTimeLocale({
  locale: BuiltInExcelDateTimeLocaleId.Chinese,
  symbols: ChineseExcelDateTimeSymbols,
});

/** Legacy alias for the default parser, which now falls back to English symbols. */
export const CompatibleExcelDateTimeLocale: FormulaDateTimeLocale = EnglishExcelDateTimeLocale;

/** Creates a built-in Excel-compatible date/time locale. */
export function createExcelDateTimeLocale(
  input:
    | BuiltInExcelDateTimeLocaleIdType
    | {
        readonly locale: string;
        readonly symbols?: FormulaDateTimeSymbols;
      },
): FormulaDateTimeLocale {
  const locale = typeof input === 'string' ? input : input.locale;
  const symbols = typeof input === 'string' ? builtInSymbolsForLocale(input) : input.symbols;
  const resolvedSymbols = normalizeDateTimeSymbols(symbols);
  return {
    locale,
    ...(symbols === void 0 ? {} : { symbols }),
    parseDateTime(value: unknown, options: FormulaDateTimeParseOptions = {}): FormulaDateTimeParseResult | null {
      return parseExcelDateTimeInternal(value, options, resolvedSymbols);
    },
    formatDateTime: formatExcelDateTime,
  };
}

/** Creates the default formula locale provider used when no i18n plugin is installed. */
export function createDefaultFormulaLocaleProvider(): IFormulaLocaleProvider {
  return {
    getDateTimeLocale(): FormulaDateTimeLocale {
      return CompatibleExcelDateTimeLocale;
    },
    getTextLocale(): FormulaTextLocale {
      return CjkFormulaTextLocale;
    },
  };
}

export function currentExcelDateTimeSerial(context: EvalContext): number {
  return unixMillisToExcelSerial(context.currentDateTime?.() ?? Date.now());
}

export function unixMillisToExcelSerial(epochMs: number): number {
  return epochMs / DAY_MS + 25_569;
}

export function excelSerialToUnixMillis(serial: number): number {
  const dateSerial = Math.floor(serial);
  const time = serial - dateSerial;
  const adjustedDateSerial = dateSerial > 60 ? dateSerial - 1 : dateSerial;
  return EXCEL_EPOCH_UTC + adjustedDateSerial * DAY_MS + time * DAY_MS;
}

export function excelSerialFromDateParts(year: number, month: number, day: number): number | null {
  const normalizedYear = normalizeExcelYear(Math.trunc(year));
  if (normalizedYear < 0 || normalizedYear > 9999) return null;
  if (normalizedYear === 1900 && Math.trunc(month) === 2 && Math.trunc(day) === 29) return 60;

  const date = createUtcDate(normalizedYear, Math.trunc(month) - 1, Math.trunc(day));
  const fullYear = date.getUTCFullYear();
  if (fullYear < 0 || fullYear > 9999) return null;

  const days = Math.floor((date.getTime() - EXCEL_EPOCH_UTC) / DAY_MS);
  return days >= 60 ? days + 1 : days;
}

export const LAST_EXCEL_DATE_SERIAL = 2_958_465;

export function excelDatePartsFromSerial(serial: number): ExcelDateParts | null {
  if (!Number.isFinite(serial) || serial < 0 || serial > LAST_EXCEL_DATE_SERIAL) return null;
  const dateSerial = Math.floor(serial);
  if (dateSerial === 0) return { year: 1900, month: 1, day: 0 };
  if (dateSerial === 60) return { year: 1900, month: 2, day: 29, phantomLeapDay: true };

  const adjustedSerial = dateSerial > 60 ? dateSerial - 1 : dateSerial;
  const date = new Date(EXCEL_EPOCH_UTC + adjustedSerial * DAY_MS);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function excelTimeFraction(hour: number, minute: number, second: number): number | null {
  if (![hour, minute, second].every(Number.isFinite)) return null;
  const totalSeconds = Math.trunc(hour) * 3600 + Math.trunc(minute) * 60 + Math.trunc(second);
  const secondsInDay = 86_400;
  return (((totalSeconds % secondsInDay) + secondsInDay) % secondsInDay) / secondsInDay;
}

export function parseExcelDateTime(
  value: unknown,
  options: ExcelDateTimeParseOptions = {},
): ParsedExcelDateTime | null {
  if (options.locale) {
    return options.locale.parseDateTime(
      value,
      options.currentDateTime === void 0 ? {} : { currentDateTime: options.currentDateTime },
    );
  }
  return parseExcelDateTimeInternal(value, options, EnglishExcelDateTimeResolvedSymbols);
}

function parseExcelDateTimeInternal(
  value: unknown,
  options: FormulaDateTimeParseOptions,
  symbols: NormalizedDateTimeSymbols,
): ParsedExcelDateTime | null {
  const text = normalizeDateTimeText(value);
  if (!text) return null;

  const time = parseTime(text, symbols);
  const dateText = time ? removeSpan(text, time.start, time.end).replace(/\s+/g, ' ').trim() : text;
  const currentYear = currentYearFromOptions(options);
  const dateSerial = dateText ? parseDateSerial(dateText, currentYear, symbols) : null;

  if (dateText && dateSerial === null) return null;
  if (!dateText && !time) return null;

  return {
    serial: (dateSerial ?? 0) + (time?.fraction ?? 0),
    hasDate: dateSerial !== null,
    hasTime: time !== null,
  };
}

export function parseExcelDate(value: unknown, options: ExcelDateTimeParseOptions = {}): number | null {
  const parsed = parseExcelDateTime(value, options);
  return parsed?.hasDate ? Math.floor(parsed.serial) : null;
}

export function parseExcelTime(value: unknown, options: ExcelDateTimeParseOptions = {}): number | null {
  const parsed = parseExcelDateTime(value, options);
  return parsed?.hasTime ? parsed.serial - Math.floor(parsed.serial) : null;
}

export function formatExcelDateTime(serial: number, pattern = 'yyyy-m-d'): string {
  const parts = excelDatePartsFromSerial(serial);
  if (!parts) return String(serial);
  const fraction = ((serial % 1) + 1) % 1;
  const totalSeconds = Math.floor(fraction * 86_400 + 0.5) % 86_400;
  const hour = Math.floor(totalSeconds / 3600);
  const minute = Math.floor((totalSeconds % 3600) / 60);
  const second = totalSeconds % 60;

  return pattern.replace(/yyyy|yy|mm|m|dd|d|hh|h|ss|s/g, (token, offset, source) => {
    if (token === 'yyyy') return String(parts.year).padStart(4, '0');
    if (token === 'yy') return String(parts.year % 100).padStart(2, '0');
    if (token === 'dd') return String(parts.day).padStart(2, '0');
    if (token === 'd') return String(parts.day);
    if (token === 'hh') return String(hour).padStart(2, '0');
    if (token === 'h') return String(hour);
    if (token === 'ss') return String(second).padStart(2, '0');
    if (token === 's') return String(second);
    const minuteToken = isMinuteToken(source, offset, token.length);
    const value = minuteToken ? minute : parts.month;
    return token.length === 2 ? String(value).padStart(2, '0') : String(value);
  });
}

function normalizeExcelYear(year: number): number {
  return year >= 0 && year <= 1899 ? year + 1900 : year;
}

function createUtcDate(year: number, monthIndex: number, day: number): Date {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, monthIndex, day);
  return date;
}

function normalizeDateTimeText(value: unknown): string {
  const text = isFormulaText(value) ? value.value : typeof value === 'string' ? value : '';
  return text.replace(/[“”]/g, '"').replace(/[，]/g, ',').replace(/\s+/g, ' ').trim();
}

function currentYearFromOptions(options: FormulaDateTimeParseOptions): number {
  const serial =
    options.currentDateTime === void 0
      ? unixMillisToExcelSerial(Date.now())
      : unixMillisToExcelSerial(options.currentDateTime);
  return excelDatePartsFromSerial(serial)?.year ?? new Date().getUTCFullYear();
}

function parseDateSerial(text: string, currentYear: number, symbols: NormalizedDateTimeSymbols): number | null {
  const source = text.trim().replace(/,$/, '');
  let match = symbols.unitDatePattern?.exec(source) ?? null;
  if (match) return parseStrictDateParts(Number(match[1]), Number(match[2]), Number(match[3]));

  match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(source);
  if (match) return parseStrictDateParts(Number(match[1]), Number(match[2]), Number(match[3]));

  match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(source);
  if (match) return parseStrictDateParts(parseTextYear(match[3]!), Number(match[1]), Number(match[2]));

  match = /^(\d{1,2})-([^-]+?)(?:-(\d{2,4}))?$/.exec(source);
  if (match) {
    const month = symbols.months.get(normalizeSymbolKey(match[2]!));
    if (!month) return null;
    return parseStrictDateParts(match[3] ? parseTextYear(match[3]) : currentYear, month, Number(match[1]));
  }

  return null;
}

function parseTextYear(text: string): number {
  const year = Number(text);
  return text.length === 2 ? year + (year <= 29 ? 2000 : 1900) : year;
}

function parseStrictDateParts(year: number, month: number, day: number): number | null {
  const normalizedYear = normalizeExcelYear(year);
  if (normalizedYear === 1900 && month === 2 && day === 29) return 60;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = createUtcDate(normalizedYear, month - 1, day);
  if (date.getUTCFullYear() !== normalizedYear || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    return null;
  }
  return excelSerialFromDateParts(year, month, day);
}

function parseTime(
  text: string,
  symbols: NormalizedDateTimeSymbols,
): { fraction: number; start: number; end: number } | null {
  const meridiem = symbols.meridiemPattern?.source;
  const timePattern = meridiem
    ? new RegExp(`(${meridiem})?\\s*(\\d{1,2}):(\\d{1,2})(?::(\\d{1,2}))?\\s*(${meridiem})?`, 'iu')
    : /(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/u;
  const match = timePattern.exec(text);
  if (!match || match.index === void 0) return null;
  const beforeMeridiem = meridiem ? match[1] : void 0;
  const timeOffset = meridiem ? 2 : 1;
  const afterMeridiem = meridiem ? match[5] : void 0;
  const period = resolveMeridiemPeriod(beforeMeridiem ?? afterMeridiem ?? '', symbols);
  let hour = Number(match[timeOffset]);
  const minute = Number(match[timeOffset + 1]);
  const second = match[timeOffset + 2] === void 0 ? 0 : Number(match[timeOffset + 2]);
  if (hour > 23 || minute > 59 || second > 59) return null;
  if (period !== null && (hour < 1 || hour > 12)) return null;
  if (period === 'pm') {
    if (hour < 12) hour += 12;
  } else if (period === 'am' && hour === 12) {
    hour = 0;
  }
  const fraction = excelTimeFraction(hour, minute, second);
  return fraction === null ? null : { fraction, start: match.index, end: match.index + match[0].length };
}

function builtInSymbolsForLocale(locale: BuiltInExcelDateTimeLocaleIdType): FormulaDateTimeSymbols {
  return locale === BuiltInExcelDateTimeLocaleId.Chinese ? ChineseExcelDateTimeSymbols : EnglishExcelDateTimeSymbols;
}

function normalizeDateTimeSymbols(symbols: FormulaDateTimeSymbols | undefined): NormalizedDateTimeSymbols {
  const merged = mergeWithEnglishFallback(symbols);
  const months = new Map<string, number>();
  for (const symbol of merged.months ?? []) {
    if (symbol.month >= 1 && symbol.month <= 12 && symbol.text.trim()) {
      months.set(normalizeSymbolKey(symbol.text), symbol.month);
    }
  }

  const meridiems = new Map<string, 'am' | 'pm'>();
  for (const symbol of merged.meridiems ?? []) {
    if (symbol.text.trim()) meridiems.set(normalizeSymbolKey(symbol.text), symbol.period);
  }
  const meridiemPattern = createAlternationPattern([...meridiems.keys()]);
  const yearUnits = normalizeSymbolList(merged.units?.year);
  const monthUnits = normalizeSymbolList(merged.units?.month);
  const dayUnits = normalizeSymbolList(merged.units?.day);

  return {
    months,
    meridiems,
    yearUnits,
    monthUnits,
    dayUnits,
    meridiemPattern,
    unitDatePattern: createUnitDatePattern(yearUnits, monthUnits, dayUnits),
  };
}

function mergeWithEnglishFallback(symbols: FormulaDateTimeSymbols | undefined): FormulaDateTimeSymbols {
  return {
    months: [...(symbols?.months ?? []), ...(EnglishExcelDateTimeSymbols.months ?? [])],
    meridiems: [...(symbols?.meridiems ?? []), ...(EnglishExcelDateTimeSymbols.meridiems ?? [])],
    units: {
      year: [...(symbols?.units?.year ?? []), ...(EnglishExcelDateTimeSymbols.units?.year ?? [])],
      month: [...(symbols?.units?.month ?? []), ...(EnglishExcelDateTimeSymbols.units?.month ?? [])],
      day: [...(symbols?.units?.day ?? []), ...(EnglishExcelDateTimeSymbols.units?.day ?? [])],
    },
  };
}

function normalizeSymbolList(symbols: readonly string[] | undefined): readonly string[] {
  return [...new Set((symbols ?? []).map((symbol) => symbol.trim()).filter(Boolean))];
}

function createUnitDatePattern(
  yearUnits: readonly string[],
  monthUnits: readonly string[],
  dayUnits: readonly string[],
): RegExp | null {
  if (yearUnits.length === 0 || monthUnits.length === 0) return null;
  const year = createAlternationSource(yearUnits);
  const month = createAlternationSource(monthUnits);
  const day = dayUnits.length > 0 ? `(?:${createAlternationSource(dayUnits)})?` : '';
  return new RegExp(`^(\\d{4})\\s*(?:${year})\\s*(\\d{1,2})\\s*(?:${month})\\s*(\\d{1,2})\\s*${day}$`, 'u');
}

function createAlternationPattern(symbols: readonly string[]): RegExp | null {
  if (symbols.length === 0) return null;
  return new RegExp(createAlternationSource(symbols), 'iu');
}

function createAlternationSource(symbols: readonly string[]): string {
  return symbols
    .slice()
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join('|');
}

function resolveMeridiemPeriod(meridiem: string, symbols: NormalizedDateTimeSymbols): 'am' | 'pm' | null {
  const text = meridiem.trim();
  return text ? symbols.meridiems.get(normalizeSymbolKey(text)) ?? null : null;
}

function normalizeSymbolKey(symbol: string): string {
  return symbol.trim().toLocaleUpperCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeSpan(text: string, start: number, end: number): string {
  return `${text.slice(0, start)} ${text.slice(end)}`;
}

function isMinuteToken(source: string, offset: number, length: number): boolean {
  const before = source.slice(0, offset).toLowerCase();
  const after = source.slice(offset + length).toLowerCase();
  return /h+:?$/.test(before) || /^:?s+/.test(after);
}
