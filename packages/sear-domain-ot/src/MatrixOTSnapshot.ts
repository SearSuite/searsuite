/** Mutable matrix capability required by MatrixOT application. */
export interface MatrixOTSnapshot<T> {
  addRow(index: number, value: (T | null)[]): void;
  deleteRows(index: number, count: number): void;
  swapRow(sourceIndex: number, targetIndex: number): void;
  addColumn(index: number, value: (T | null)[]): void;
  deleteColumns(index: number, count: number): void;
  swapColumn(sourceIndex: number, targetIndex: number): void;
  addItem(row: number, col: number, value: T): void;
  removeItem(row: number, col: number): void;
}
