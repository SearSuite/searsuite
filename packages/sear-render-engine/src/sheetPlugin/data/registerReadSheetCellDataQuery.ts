import { cloneCellMatrixElement, type SheetMatrix } from '../../SheetMatrix';
import { ReadSheetCellDataQuery } from './ReadSheetCellDataQuery';
import { type SheetCellDataReader } from './SheetCellDataReader';
import { type SheetDataQueryRegistry } from './SheetDataQueryRegistry';

/** Registers the live, read-only cell-data projection owned by SheetDataPlugin. */
export function registerReadSheetCellDataQuery(queries: SheetDataQueryRegistry, read: () => SheetMatrix): void {
  const reader: SheetCellDataReader = {
    get shape() {
      return [...read().shape];
    },
    getItem(row, column) {
      const cell = read().getItem(row, column);
      return cell ? cloneCellMatrixElement(cell) : null;
    },
    forEachStoredInRange(startRow, startColumn, endRow, endColumn, visit) {
      read().forEachStoredInRange(startRow, startColumn, endRow, endColumn, (cell, row, column) => {
        visit(cloneCellMatrixElement(cell), row, column);
      });
    },
  };
  queries.register(ReadSheetCellDataQuery, () => reader);
}
