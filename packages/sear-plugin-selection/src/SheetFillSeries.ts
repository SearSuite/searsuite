import { CellType, type CellMatrixElement } from '@searsuite/sear-domain-cell-types';

export interface SheetFillSeries {
  valueAt(index: number): number | string;
}

/** Infers a constant-step series from one row or column of persisted cells. */
export function inferSheetFillSeries(source: readonly (CellMatrixElement | null)[], singleStep?: number): SheetFillSeries | null {
  if (source.length === 1 && Number.isFinite(singleStep) &&
      source[0]?.type === CellType.Number && typeof source[0].value === 'number') {
    const first = source[0].value;
    return { valueAt: (index) => first + index * singleStep! };
  }
  if (source.length < 2) return null;
  if (source.every((cell) => cell?.type === CellType.Number && typeof cell.value === 'number' && Number.isFinite(cell.value))) {
    const first = source[0]!.value as number;
    const step = (source[1]!.value as number) - first;
    if (source.every((cell, index) => cell!.value === first + index * step)) {
      return { valueAt: (index) => first + index * step };
    }
    return null;
  }

  if (!source.every((cell) => cell?.type === CellType.String && typeof cell.value === 'string')) return null;
  const parts = source.map((cell) => /^(.*?)(\d+)$/.exec(cell!.value as string));
  if (parts.some((part) => !part || !part[1])) return null;
  const prefix = parts[0]![1];
  const width = parts[0]![2].length;
  if (!parts.every((part) => part![1] === prefix && part![2].length === width)) return null;
  const first = Number(parts[0]![2]);
  const step = Number(parts[1]![2]) - first;
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(step) ||
      !parts.every((part, index) => Number(part![2]) === first + index * step)) return null;
  return {
    valueAt(index) {
      const value = first + index * step;
      return Number.isSafeInteger(value) && value >= 0
        ? `${prefix}${String(value).padStart(width, '0')}`
        : `${prefix}${value}`;
    },
  };
}
