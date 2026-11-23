import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { type SheetCellBorder } from './SheetCellBorder';
import { cloneCellBorder } from './CellBorderValidation';

/** Serialized sparse border entries. */
export interface CellBorderMatrixData {
  readonly data: (SheetCellBorder | null)[];
  readonly indices: number[];
  readonly indptr: number[];
}

/** Feature-owned sparse matrix; empty edge records are represented by absence. */
export class CellBorderMatrix extends CSRMatrix<SheetCellBorder | null> {
  public constructor(
    data: CellBorderMatrixData = { data: [], indices: [0], indptr: [] },
    shape: [number, number] = [0, 0],
  ) {
    super(void 0, shape);
    for (let row = 0; row < shape[0]; row += 1) {
      for (let index = data.indices[row] ?? 0; index < (data.indices[row + 1] ?? 0); index += 1) {
        const column = data.indptr[index];
        if (column !== undefined) this.setItem(row, column, data.data[index] ?? null);
      }
    }
  }
  /** Stores an isolated edge record or clears its sparse entry. */
  public setItem(row: number, column: number, value: SheetCellBorder | null): this {
    const border = cloneCellBorder(value);
    if (border === null) {
      this.removeItem(row, column);
      return this;
    }
    return super.addItem(row, column, border);
  }
  public override addItem(row: number, column: number, value: SheetCellBorder | null): this {
    return this.setItem(row, column, value);
  }
  public override getItem(row: number, column: number): SheetCellBorder | null {
    return cloneCellBorder(super.getItem(row, column));
  }
  public override clone(): this {
    const matrix = new CellBorderMatrix(void 0, [...this.shape] as [number, number]);
    this.forEachStored((value, row, column) => matrix.setItem(row, column, value));
    return matrix as this;
  }
}
