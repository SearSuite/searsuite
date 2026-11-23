import { type FormulaDateTimeParseOptions } from './FormulaDateTimeParseOptions';
import { type FormulaDateTimeParseResult } from './FormulaDateTimeParseResult';
import { type FormulaDateTimeSymbols } from './FormulaDateTimeSymbols';

/** Locale-specific date/time parsing and formatting used by formulas. */
export interface FormulaDateTimeLocale {
  readonly locale: string;
  readonly symbols?: FormulaDateTimeSymbols;
  parseDateTime(value: unknown, options?: FormulaDateTimeParseOptions): FormulaDateTimeParseResult | null;
  formatDateTime(serial: number, pattern?: string): string;
}
