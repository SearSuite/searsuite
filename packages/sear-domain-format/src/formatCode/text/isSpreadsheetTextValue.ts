import { type SpreadsheetTextValue } from '../../types/SpreadsheetFormatTypes';

export function isSpreadsheetTextValue(value: unknown): value is SpreadsheetTextValue {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'text';
}
