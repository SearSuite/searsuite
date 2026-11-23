import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import {
  SheetVerticalAlignment,
  assertSheetVerticalAlignment,
} from '@searsuite/sear-domain-cell-types';

/** Serialized sparse entries accepted by VerticalAlignmentMatrix. */
export interface VerticalAlignmentMatrixData {
  /** Explicit non-default alignment values. */
  data: string[];
  /** CSR row pointers. */
  indices: number[];
  /** CSR column indices. */
  indptr: number[];
}

/** Sparse vertical-alignment matrix whose absent cells resolve to centered alignment. */
export class VerticalAlignmentMatrix extends CSRMatrix<string> {
  /** Default vertical alignment returned for cells without an explicit override. */
  public static readonly defaultAlignment = SheetVerticalAlignment.Center;

  /** Creates a matrix and compacts explicit default-alignment entries. */
  public constructor(
    data: VerticalAlignmentMatrixData = { data: [], indices: [0], indptr: [] },
    shape: [number, number] = [0, 0],
  ) {
    super(void 0, shape);
    this.setDefaultValue(VerticalAlignmentMatrix.defaultAlignment);
    for (let row = 0; row < shape[0]; row += 1) {
      const start = data.indices[row] ?? 0;
      const end = data.indices[row + 1] ?? start;
      for (let index = start; index < end; index += 1) {
        const value = data.data[index];
        const column = data.indptr[index];
        if (value !== VerticalAlignmentMatrix.defaultAlignment && column !== void 0) {
          assertSheetVerticalAlignment(value);
          super.addItem(row, column, value);
        }
      }
    }
  }

  /** Stores an explicit non-default override, or removes it for centered alignment. */
  public override addItem(row: number, col: number, value: string): this {
    assertSheetVerticalAlignment(value);
    if (value === VerticalAlignmentMatrix.defaultAlignment) {
      this.removeItem(row, col);
      return this;
    }
    return super.addItem(row, col, value);
  }
}
