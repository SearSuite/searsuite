import { type MatrixOTSnapshot } from './MatrixOTSnapshot';

/**
 * @internal
 * Dense in-memory MatrixOT snapshot used to rebase deleted row/column payloads.
 */
export class DenseMatrixOTSnapshot<U> implements MatrixOTSnapshot<U> {
  private data: Array<Array<U | null>> = [];

  /** Replaces the snapshot with a dense matrix payload. */
  public fromDense(rows: Array<Array<U | null>>): this {
    this.data = rows.map((row) => [...row]);
    return this;
  }

  /** Returns the current dense matrix payload. */
  public toArray(): Array<Array<U | null>> {
    return this.data.map((row) => [...row]);
  }

  /** Inserts a row payload at the requested index. */
  public addRow(index: number, value: Array<U | null>): void {
    this.data.splice(index, 0, [...value]);
  }

  /** Deletes one or more rows starting at the requested index. */
  public deleteRows(index: number, count: number): void {
    this.data.splice(index, count);
  }

  /** Swaps two row positions. */
  public swapRow(sourceIndex: number, targetIndex: number): void {
    const source = this.data[sourceIndex];
    this.data[sourceIndex] = this.data[targetIndex];
    this.data[targetIndex] = source;
  }

  /** Inserts a column payload at the requested index. */
  public addColumn(index: number, value: Array<U | null>): void {
    const rowCount = Math.max(this.data.length, value.length);
    for (let row = 0; row < rowCount; row++) {
      if (!this.data[row]) this.data[row] = [];
      this.data[row].splice(index, 0, value[row] ?? null);
    }
  }

  /** Deletes one or more columns starting at the requested index. */
  public deleteColumns(index: number, count: number): void {
    for (const row of this.data) {
      row.splice(index, count);
    }
  }

  /** Swaps two column positions. */
  public swapColumn(sourceIndex: number, targetIndex: number): void {
    for (const row of this.data) {
      const source = row[sourceIndex] ?? null;
      row[sourceIndex] = row[targetIndex] ?? null;
      row[targetIndex] = source;
    }
  }

  /** Writes one cell value. */
  public addItem(row: number, col: number, value: U): void {
    while (this.data.length <= row) this.data.push([]);
    this.data[row][col] = value;
  }

  /** Removes one cell value. */
  public removeItem(row: number, col: number): void {
    if (this.data[row]) this.data[row][col] = null;
  }
}
