import {
  CellType,
  formatCellNumberDisplay,
  type CellFormatLocale,
  type CellMatrixElement,
} from '@searsuite/sear-domain-cell-types';

/** Reads the same numeric display color used by the cell renderer. */
export function readFormattedNumberCellColor(
  cell: CellMatrixElement | null,
  format: unknown,
  locale: CellFormatLocale,
): string | null {
  if (cell?.type !== CellType.Number || typeof cell.value !== 'number') return null;
  return formatCellNumberDisplay(cell.value, format, locale).color ?? null;
}
