import { CSRMatrix } from '@searsuite/sear-domain-matrix';

/** Sparse serialization payload accepted by the freeze matrix. */
export interface SheetFreezeMatrixData {
  /** Stored boundary counts. */
  readonly data: (number | null)[];
  /** Sparse row offsets. */
  readonly indices: number[];
  /** Stored axis indices. */
  readonly indptr: number[];
}

/** One row with the frozen row and column counts at columns zero and one. */
export class SheetFreezeMatrix extends CSRMatrix<number | null> {
  /** Creates or restores a freeze matrix. */
  public constructor(
    data: SheetFreezeMatrixData = { data: [], indices: [0, 0], indptr: [] },
    shape: [number, number] = [1, 2],
  ) {
    super(void 0, shape);
    for (let index = data.indices[0] ?? 0; index < (data.indices[1] ?? 0); index += 1) {
      const axis = data.indptr[index];
      const count = data.data[index];
      if (axis !== void 0 && count != null && count > 0) super.addItem(0, axis, count);
    }
  }

  /** Sets a boundary count, removing empty values from sparse storage. */
  public setItem(row: number, column: number, value: number | null): this {
    if (value == null || value === 0) {
      this.removeItem(row, column);
      return this;
    }
    return super.addItem(row, column, value);
  }

  /** Adds a boundary count through the same sparse normalization. */
  public override addItem(row: number, column: number, value: number | null): this {
    return this.setItem(row, column, value);
  }
}
