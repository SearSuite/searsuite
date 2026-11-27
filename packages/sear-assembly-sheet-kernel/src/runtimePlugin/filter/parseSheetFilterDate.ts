import { FormulaDateSystem, type IFormulaDateSystemProvider } from '@searsuite/sear-domain-formula-engine';

const DAY_MS = 86_400_000;

/** Converts ISO date input to the workbook's Excel serial system. */
export function parseSheetFilterDate(value: unknown, dateSystem: IFormulaDateSystemProvider): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.floor(value) : null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) return null;
  if (dateSystem.getDateSystem() === FormulaDateSystem.Excel1904) {
    return (timestamp - Date.UTC(1904, 0, 1)) / DAY_MS;
  }
  const serial = (timestamp - Date.UTC(1899, 11, 31)) / DAY_MS;
  return serial >= 60 ? serial + 1 : serial;
}
