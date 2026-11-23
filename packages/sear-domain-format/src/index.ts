/**
 * Portable cell-format values and formatting contracts.
 *
 * @packageDocumentation
 */

export {
  DefaultSpreadsheetFormatLocale,
  type ExcelDateParts,
  type SpreadsheetErrorValue,
  type SpreadsheetFormatLocale,
  type SpreadsheetFormatDisplay,
  type SpreadsheetFormatValue,
  type SpreadsheetTextValue,
} from './types/SpreadsheetFormatTypes';
export { excelDatePartsFromSerial } from './dateTime/excelDatePartsFromSerial';
export { formatExcelDateTime } from './dateTime/formatExcelDateTime';
export { formatExcelText } from './formatCode/formatExcelText';
export { formatExcelDisplay } from './formatCode/formatExcelDisplay';
export { inspectExcelCellFormat, type ExcelCellFormatInfo } from './formatCode/inspectExcelCellFormat';
export { formatSpreadsheetNumber } from './formatCode/formatSpreadsheetNumber';
export { formatDollar } from './fixed/formatDollar';
export { formatFixed } from './fixed/formatFixed';
export { parseNumberValue, parseSpreadsheetNumericLiteral } from './parse/parseNumberValue';
