import { CSRMatrix } from '@searsuite/sear-domain-matrix';

/** Serialized sparse storage accepted by FixedRowMatrix. */
export interface FixedRowMatrixData {
  readonly data: (boolean | null)[];
  readonly indices: number[];
  readonly indptr: number[];
}

/** Sparse one-by-row-count matrix whose stored `true` values identify fixed rows. */
export class FixedRowMatrix extends CSRMatrix<boolean | null> {
  public constructor(
    data: FixedRowMatrixData = { data: [], indices: [0, 0], indptr: [] },
    shape: [number, number] = [1, 0],
  ) {
    super(void 0, shape);
    for (let index = data.indices[0] ?? 0; index < (data.indices[1] ?? 0); index += 1) {
      const column = data.indptr[index];
      if (column !== void 0 && data.data[index] === true) super.addItem(0, column, true);
    }
  }

  /** Stores true sparsely; false and null clear the row's fixed state. */
  public setItem(row: number, column: number, value: boolean | null): this {
    if (value !== true) {
      this.removeItem(row, column);
      return this;
    }
    return super.addItem(row, column, true);
  }

  public override addItem(row: number, column: number, value: boolean | null): this {
    return this.setItem(row, column, value);
  }
}
