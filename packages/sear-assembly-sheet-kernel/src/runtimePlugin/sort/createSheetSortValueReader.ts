import { CellClipboardCodecRegistry, CellType } from '@searsuite/sear-domain-cell-types';
import { isFormulaError, type IFormulaResultProvider } from '@searsuite/sear-domain-formula-engine';
import { type SheetMatrix } from '@searsuite/sear-domain-sheet';
import { type SheetSortValue } from '@searsuite/sear-plugin-sort';

/** Reads the user's value projection while preserving numeric comparison semantics. */
export function createSheetSortValueReader(
  readMatrix: () => SheetMatrix,
  readCodecs: () => CellClipboardCodecRegistry,
  readFormulaResults: () => IFormulaResultProvider,
): (row: number, column: number) => SheetSortValue {
  return (row, column) => {
    const cell = readMatrix().getItem(row, column);
    const value =
      !cell || cell.type === CellType.Formula ? readFormulaResults().getFormulaResult(row, column) : cell.value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value;
    if (isFormulaError(value)) return value.code;
    return cell ? readCodecs().toPlainText(cell) || null : null;
  };
}
