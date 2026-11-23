import { type SpreadsheetTextValue } from '../../types/SpreadsheetFormatTypes';

export function conciseSpreadsheetText(value: string | SpreadsheetTextValue): string {
  return typeof value === 'string' ? value : value.value;
}
