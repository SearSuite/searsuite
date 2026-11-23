import { type ExcelDateParts } from '../types/SpreadsheetFormatTypes';

const DAY_MS = 86_400_000;
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 31);
const EXCEL_DATE_SERIAL_LIMIT = 2_958_466;

export function excelDatePartsFromSerial(serial: number): ExcelDateParts | null {
  if (!Number.isFinite(serial) || serial < 0 || serial >= EXCEL_DATE_SERIAL_LIMIT) return null;
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
