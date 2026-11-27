import {
  DefaultSpreadsheetFormatLocale,
  type SpreadsheetErrorValue,
  type SpreadsheetFormatValue,
} from '../types/SpreadsheetFormatTypes';
import { formatExcelDisplay } from './formatExcelDisplay';

export function formatExcelText(
  value: SpreadsheetFormatValue,
  formatText: string,
  locale = DefaultSpreadsheetFormatLocale,
): string | SpreadsheetErrorValue | null {
  const display = formatExcelDisplay(value, formatText, locale);
  return display !== null && 'text' in display ? display.text : display;
}
