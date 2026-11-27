import { type CellMatrixElement } from './SheetMatrix';

/** Read-only live cell-data projection exposed by SheetDataPlugin. */
export interface SheetCellDataReader {
  readonly shape: readonly number[];
  getItem(row: number, column: number): CellMatrixElement | null;
  forEachStoredInRange?(
    startRow: number,
    startColumn: number,
    endRow: number,
    endColumn: number,
    visit: (cell: CellMatrixElement, row: number, column: number) => void,
  ): void;
}
