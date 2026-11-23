import { CellClipboardCodecRegistry, CellType } from '@searsuite/sear-domain-cell-types';
import { type IFormulaResultProvider } from '@searsuite/sear-domain-formula-engine';
import { type SheetMatrix } from '@searsuite/sear-render-engine';
import {
  type CellHighlightNumericRangeReader, type CellHighlightValueReader, type CellHighlightValueRangeReader,
} from '@searsuite/sear-plugin-cell-highlight';

/** Composes persisted cells and derived formula projections for highlight evaluation. */
export function createCellHighlightValueSource(
  readMatrix: () => SheetMatrix,
  readCodecs: () => CellClipboardCodecRegistry | null,
  readFormulaResults: () => IFormulaResultProvider | null,
): {
  readValue: CellHighlightValueReader;
  forEachValueInRange: CellHighlightValueRangeReader;
  forEachValueWithCoordinatesInRange: (
    startRow: number, startColumn: number, endRow: number, endColumn: number,
    visit: (value: unknown, row: number, column: number) => void,
  ) => void;
  readNumericValue: (row: number, column: number) => number | null;
  forEachNumericValueInRange: CellHighlightNumericRangeReader;
} {
  const visibleFormulaValue = (value: unknown): unknown => {
    if (!Array.isArray(value)) return value;
    const firstRow = Array.isArray(value[0]) ? value[0] : value;
    return firstRow[0];
  };
  const readValue: CellHighlightValueReader = (row, column) => {
    const cell = readMatrix().getItem(row, column);
    if (cell?.type === CellType.Formula || cell === null) {
      return visibleFormulaValue(readFormulaResults()?.getFormulaResult(row, column)) ?? null;
    }
    return cell ? readCodecs()?.toPlainText(cell) ?? null : null;
  };

  const readNumericValue = (row: number, column: number): number | null => {
    const cell = readMatrix().getItem(row, column);
    const value = cell?.type === CellType.Formula || cell === null
      ? visibleFormulaValue(readFormulaResults()?.getFormulaResult(row, column))
      : cell?.type === CellType.Number ? cell.value : null;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };

  const forEachOccupiedCoordinate = (
    startRow: number, startColumn: number, endRow: number, endColumn: number,
    visit: (row: number, column: number) => void,
  ): void => {
    const matrix = readMatrix();
    matrix.forEachStoredInRange(startRow, startColumn, endRow, endColumn, (_cell, row, column) => {
      visit(row, column);
    });
    readFormulaResults()?.forEachFormulaResultInRange?.(
      startRow, startColumn, endRow, endColumn,
      (row, column) => {
        if (matrix.getItem(row, column) === null) visit(row, column);
      },
    );
  };

  const forEachValueInRange: CellHighlightValueRangeReader = (startRow, startColumn, endRow, endColumn, visit) =>
    forEachOccupiedCoordinate(startRow, startColumn, endRow, endColumn, (row, column) => visit(readValue(row, column)));
  const forEachValueWithCoordinatesInRange = (
    startRow: number, startColumn: number, endRow: number, endColumn: number,
    visit: (value: unknown, row: number, column: number) => void,
  ): void => forEachOccupiedCoordinate(startRow, startColumn, endRow, endColumn,
    (row, column) => visit(readValue(row, column), row, column));
  const forEachNumericValueInRange: CellHighlightNumericRangeReader = (startRow, startColumn, endRow, endColumn, visit) =>
    forEachOccupiedCoordinate(startRow, startColumn, endRow, endColumn, (row, column) => {
      const value = readNumericValue(row, column);
      if (value !== null) visit(value);
    });

  return { readValue, forEachValueInRange, forEachValueWithCoordinatesInRange,
    readNumericValue, forEachNumericValueInRange };
}
