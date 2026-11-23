import { DefaultSpreadsheetFormatLocale, type SpreadsheetFormatLocale } from '../types/SpreadsheetFormatTypes';
import { formatExcelText } from './formatExcelText';

export function formatSpreadsheetNumber(
  value: number,
  code: string,
  locale: SpreadsheetFormatLocale = DefaultSpreadsheetFormatLocale,
): string | null {
  const result = formatExcelText(value, code, locale);
  return typeof result === 'string' ? result : null;
}
