import {
  formatExcelDateTime,
  formatExcelDisplay,
  parseNumberValue,
  parseSpreadsheetNumericLiteral,
  type SpreadsheetFormatDisplay,
} from '@searsuite/sear-domain-format';

/** Cell formatting changes input interpretation and display only, never the raw value for display purposes. */
export type CellFormat =
  | { readonly kind: 'general' }
  | { readonly kind: 'text' }
  | { readonly kind: 'excelCode'; readonly code: string }
  | {
      readonly kind: 'number';
      readonly locale?: string;
      readonly minimumFractionDigits?: number;
      readonly maximumFractionDigits?: number;
      readonly useGrouping?: boolean;
    }
  | {
      readonly kind: 'percent';
      readonly locale?: string;
      readonly minimumFractionDigits?: number;
      readonly maximumFractionDigits?: number;
    }
  | {
      readonly kind: 'currency';
      readonly currency: string;
      readonly locale?: string;
      readonly minimumFractionDigits?: number;
      readonly maximumFractionDigits?: number;
    }
  | { readonly kind: 'date'; readonly pattern?: string }
  | { readonly kind: 'time'; readonly pattern?: string }
  | { readonly kind: 'dateTime'; readonly pattern?: string };

/** Locale defaults used when a cell format does not declare explicit display settings. */
export interface CellFormatLocale {
  readonly locale: string;
  readonly datePattern: string;
  readonly timePattern: string;
  readonly dateTimePattern: string;
  readonly decimalSeparator?: string;
  readonly groupSeparator?: string;
}

/** Provides sheet-local defaults for number and date/time display formatting. */
export interface ICellFormatLocaleProvider {
  getCellFormatLocale(): CellFormatLocale;
}

/** DI token for resolving the current sheet's cell-format locale provider. */
export namespace ICellFormatLocaleProvider {
  export const symbol = Symbol.for('ICellFormatLocaleProvider');
}

/** Excel-compatible formatting defaults used when no i18n plugin is installed. */
export const DefaultCellFormatLocale: CellFormatLocale = {
  locale: 'en',
  datePattern: 'yyyy-m-d',
  timePattern: 'h:mm:ss',
  dateTimePattern: 'yyyy-m-d h:mm:ss',
};

/** Creates the default cell-format locale provider. */
export function createDefaultCellFormatLocaleProvider(): ICellFormatLocaleProvider {
  return {
    getCellFormatLocale(): CellFormatLocale {
      return DefaultCellFormatLocale;
    },
  };
}

export const CellFormats = {
  general: { kind: 'general' } as const,
  text: { kind: 'text' } as const,
  excelCode(code: string): CellFormat {
    return { kind: 'excelCode', code };
  },
  number: { kind: 'number' } as const,
  percent: { kind: 'percent' } as const,
  date: { kind: 'date' } as const,
  time: { kind: 'time' } as const,
  dateTime: { kind: 'dateTime' } as const,
  currency(currency: string, locale?: string): CellFormat {
    return locale === void 0 ? { kind: 'currency', currency } : { kind: 'currency', currency, locale };
  },
};

/** Normalizes a public CellFormat object, falling back to General for invalid input. */
export function normalizeCellFormat(value: unknown): CellFormat {
  if (!value || typeof value !== 'object' || !('kind' in value)) return CellFormats.general;
  const format = value as Partial<CellFormat>;
  if (format.kind === 'text' || format.kind === 'general') return { kind: format.kind };
  if (format.kind === 'excelCode' && typeof (format as { code?: unknown }).code === 'string')
    return format as CellFormat;
  if (format.kind === 'number' || format.kind === 'percent') return format as CellFormat;
  if (format.kind === 'currency' && typeof (format as { currency?: unknown }).currency === 'string')
    return format as CellFormat;
  if (format.kind === 'date' || format.kind === 'time' || format.kind === 'dateTime') return format as CellFormat;
  return CellFormats.general;
}

/** Runs the parse formatted number helper. */
export function parseFormattedNumber(
  text: string,
  format: unknown,
  locale: CellFormatLocale = DefaultCellFormatLocale,
): number | undefined {
  const normalized = normalizeCellFormat(format);
  const source = text.trim();
  if (!source) return void 0;
  if (normalized.kind === 'general' || normalized.kind === 'text') return numeric(source);
  if (normalized.kind === 'excelCode') return parseDisplayNumber(source, locale);
  const value = parseDisplayNumber(source, locale);
  if (value === void 0) return void 0;
  return normalized.kind === 'percent' && !source.includes('%') ? value / 100 : value;
}

/** Runs the format cell number helper. */
export function formatCellNumber(value: number, format: unknown, locale = DefaultCellFormatLocale): string {
  return formatCellNumberDisplay(value, format, locale).text;
}

/** Returns the numeric source shown for a selected cell in the formula bar. */
export function formatCellNumberForFormulaBar(
  value: number,
  format: unknown,
  locale = DefaultCellFormatLocale,
): string {
  const normalized = normalizeCellFormat(format);
  if (normalized.kind === 'date')
    return formatCellNumber(value, { kind: 'date', pattern: 'yyyy/m/d' }, locale);
  if (normalized.kind === 'time' || normalized.kind === 'dateTime')
    return formatCellNumber(value, normalized, locale);
  return String(value);
}

/** Returns the initial text for editing a numeric cell. */
export function formatCellNumberForEditor(
  value: number,
  format: unknown,
  locale = DefaultCellFormatLocale,
): string {
  const normalized = normalizeCellFormat(format);
  return normalized.kind === 'percent'
    ? formatCellNumber(value, normalized, locale)
    : formatCellNumberForFormulaBar(value, normalized, locale);
}

/** Returns General-format candidates from most informative to most compact. */
export function createGeneralNumberDisplayCandidates(value: number): readonly string[] {
  if (!Number.isFinite(value)) return [String(value)];
  const plain = String(value);
  const candidates: string[] = [];
  const preferScientific = value !== 0 && (Math.abs(value) >= 1e11 || Math.abs(value) < 1e-9);
  const scientific = generalScientificCandidates(value);
  if (preferScientific) candidates.push(...scientific);
  candidates.push(plain);
  if (!Number.isInteger(value)) {
    for (let decimals = 14; decimals >= 0; decimals -= 1) {
      candidates.push(value.toFixed(decimals).replace(/\.0+$|(?<=\..*?)0+$/g, ''));
    }
  }
  if (!preferScientific) candidates.push(...scientific);
  return [...new Set(candidates)];
}

/** Formats one numeric cell and preserves format-section visual metadata. */
export function formatCellNumberDisplay(
  value: number,
  format: unknown,
  locale = DefaultCellFormatLocale,
): SpreadsheetFormatDisplay {
  const normalized = normalizeCellFormat(format);
  if (!Number.isFinite(value) || normalized.kind === 'general' || normalized.kind === 'text') {
    return { text: String(value) };
  }
  if (normalized.kind === 'excelCode') {
    const result = formatExcelDisplay(value, normalized.code, locale);
    return result && 'text' in result ? result : { text: String(value) };
  }
  if (normalized.kind === 'date') {
    return { text: formatExcelDateTime(value, normalized.pattern ?? locale.datePattern, locale) ?? String(value) };
  }
  if (normalized.kind === 'time') {
    return { text: formatExcelDateTime(value, normalized.pattern ?? locale.timePattern, locale) ?? String(value) };
  }
  if (normalized.kind === 'dateTime') {
    return { text: formatExcelDateTime(value, normalized.pattern ?? locale.dateTimePattern, locale) ?? String(value) };
  }
  const options = {
    minimumFractionDigits: normalized.minimumFractionDigits,
    maximumFractionDigits: normalized.maximumFractionDigits,
  };
  if (normalized.kind === 'number')
    return {
      text: new Intl.NumberFormat(normalized.locale ?? locale.locale, {
        ...options,
        useGrouping: normalized.useGrouping,
      }).format(value),
    };
  if (normalized.kind === 'percent')
    return {
      text: new Intl.NumberFormat(normalized.locale ?? locale.locale, {
        ...options,
        style: 'percent',
      }).format(value),
    };
  return {
    text: new Intl.NumberFormat(normalized.locale ?? locale.locale, {
      ...options,
      style: 'currency',
      currency: normalized.currency,
    }).format(value),
  };
}

/** Applies the fourth custom-format section to a text cell. */
export function formatCellText(value: string, format: unknown, locale = DefaultCellFormatLocale): string {
  const normalized = normalizeCellFormat(format);
  if (normalized.kind !== 'excelCode') return value;
  const result = formatExcelDisplay(value, normalized.code, locale);
  return result && 'text' in result ? result.text : value;
}

/** Converts an explicit cell format into the Excel-style code exposed to formula metadata readers. */
export function cellFormatToExcelCode(format: unknown): string | undefined {
  if (format === null || format === undefined) return undefined;
  const normalized = normalizeCellFormat(format);
  if (normalized.kind === 'general') return 'General';
  if (normalized.kind === 'text') return '@';
  if (normalized.kind === 'excelCode') return normalized.code;
  if (normalized.kind === 'date') return normalized.pattern ?? DefaultCellFormatLocale.datePattern;
  if (normalized.kind === 'time') return normalized.pattern ?? DefaultCellFormatLocale.timePattern;
  if (normalized.kind === 'dateTime') return normalized.pattern ?? DefaultCellFormatLocale.dateTimePattern;
  const decimals = decimalPlaceholders(normalized.minimumFractionDigits, normalized.maximumFractionDigits);
  const integer = normalized.kind === 'number' && normalized.useGrouping === false ? '0' : '#,##0';
  if (normalized.kind === 'number') return `${integer}${decimals}`;
  if (normalized.kind === 'percent') return `0${decimals}%`;
  return `"${normalized.currency}" ${integer}${decimals}`;
}

/** Adjusts the visible decimal-place count of numeric built-in formats. */
export function adjustCellFormatDecimalPlaces(format: unknown, delta: number): CellFormat {
  const normalized = normalizeCellFormat(format);
  const amount = Math.trunc(delta);
  if (amount === 0) return normalized;
  switch (normalized.kind) {
    case 'general':
      return decimalFormat('number', undefined, undefined, Math.max(0, amount), false);
    case 'number':
      return decimalFormat(
        normalized.kind,
        normalized.locale,
        undefined,
        adjustedDecimalPlaces(normalized, amount, 0),
        normalized.useGrouping,
      );
    case 'percent':
      return decimalFormat(normalized.kind, normalized.locale, undefined, adjustedDecimalPlaces(normalized, amount, 0));
    case 'currency':
      return decimalFormat(
        normalized.kind,
        normalized.locale,
        normalized.currency,
        adjustedDecimalPlaces(normalized, amount, 2),
      );
    default:
      return normalized;
  }
}

function decimalPlaceholders(minimum = 0, maximum = minimum): string {
  const boundedMinimum = Math.max(0, Math.min(30, Math.trunc(minimum)));
  const boundedMaximum = Math.max(boundedMinimum, Math.min(30, Math.trunc(maximum)));
  if (boundedMaximum === 0) return '';
  return `.${'0'.repeat(boundedMinimum)}${'#'.repeat(boundedMaximum - boundedMinimum)}`;
}

function generalScientificCandidates(value: number): string[] {
  const candidates: string[] = [];
  for (let decimals = 10; decimals >= 0; decimals -= 1) {
    candidates.push(
      value
        .toExponential(decimals)
        .replace(/\.0+(?=e)|(?<=\..*?)0+(?=e)/, '')
        .replace(/e\+?(-?)0*(\d+)/, 'E$1$2'),
    );
  }
  return candidates;
}

function adjustedDecimalPlaces(
  format: { readonly minimumFractionDigits?: number; readonly maximumFractionDigits?: number },
  delta: number,
  fallback: number,
): number {
  return Math.max(0, Math.min(30, (format.maximumFractionDigits ?? format.minimumFractionDigits ?? fallback) + delta));
}

function decimalFormat(
  kind: 'number' | 'percent' | 'currency',
  locale: string | undefined,
  currency: string | undefined,
  decimals: number,
  useGrouping?: boolean,
): CellFormat {
  const common = {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    ...(locale === undefined ? {} : { locale }),
  };
  if (kind === 'currency') return { ...common, kind, currency: currency! };
  if (kind === 'number') return { ...common, kind, ...(useGrouping === undefined ? {} : { useGrouping }) };
  return { ...common, kind };
}

function numeric(value: string): number | undefined {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return void 0;
  const result = parseSpreadsheetNumericLiteral(value);
  return Number.isFinite(result) ? result : void 0;
}

function parseDisplayNumber(source: string, locale: CellFormatLocale): number | undefined {
  let text = source.trim();
  let negative = false;
  if (text.startsWith('(') && text.endsWith(')')) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text
    .replace(/[\p{Sc}]/gu, '')
    .replace(/^[A-Z]{3}\s*/i, '')
    .replace(/\s*[A-Z]{3}$/i, '')
    .trim();
  const parsed = parseNumberValue(text, locale.decimalSeparator ?? '.', locale.groupSeparator ?? ',');
  if (parsed === null) return undefined;
  return negative ? -Math.abs(parsed) : parsed;
}
