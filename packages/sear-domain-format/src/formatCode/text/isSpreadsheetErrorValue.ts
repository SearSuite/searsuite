import { type SpreadsheetErrorValue } from '../../types/SpreadsheetFormatTypes';

export function isSpreadsheetErrorValue(value: unknown): value is SpreadsheetErrorValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'error' &&
    typeof (value as { code?: unknown }).code === 'string'
  );
}
