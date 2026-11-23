import { formatExcelDateTime } from './formatExcelDateTime';
import { DefaultSpreadsheetFormatLocale, type SpreadsheetFormatLocale } from '../types/SpreadsheetFormatTypes';

export function formatDateTimePattern(
  value: number,
  pattern: string,
  locale: SpreadsheetFormatLocale = DefaultSpreadsheetFormatLocale,
): string | null {
  return formatExcelDateTime(value, pattern, locale);
}
