import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import {
  SheetHorizontalAlignment,
  assertSheetHorizontalAlignment,
} from '@searsuite/sear-domain-cell-types';

/** Serialized sparse entries accepted by AlignmentMatrix. */
export interface AlignmentMatrixData {
  /** Explicit non-default alignment values. */
  data: string[];
  /** CSR row pointers. */
  indices: number[];
  /** CSR column indices. */
  indptr: number[];
}

/**
 * Sparse horizontal-alignment matrix whose absent cells resolve to left alignment.
 *
 * Only non-left values are persisted. This keeps alignment state proportional
 * to user overrides, while retaining a stable left-aligned default for every
 * cell in the declared sheet shape. Explicit default values in serialized
 * input are compacted while materializing the sparse matrix.
 */
export class AlignmentMatrix extends CSRMatrix<string> {
  /** Default horizontal alignment returned for cells without an explicit override. */
  public static readonly defaultAlignment = SheetHorizontalAlignment.Left;

  /**
   * Creates an alignment matrix and compacts explicit left-alignment entries.
   * @param data - Optional serialized CSR entries from persisted state.
   * @param shape - Declared row and column count; empty cells resolve to left alignment.
   */
  public constructor(
    data: AlignmentMatrixData = { data: [], indices: [0], indptr: [] },
    shape: [number, number] = [0, 0],
  ) {
    super(void 0, shape);
    this.setDefaultValue(AlignmentMatrix.defaultAlignment);
    for (let row = 0; row < shape[0]; row += 1) {
      const start = data.indices[row] ?? 0;
      const end = data.indices[row + 1] ?? start;
      for (let index = start; index < end; index += 1) {
        const value = data.data[index];
        const column = data.indptr[index];
        if (value !== AlignmentMatrix.defaultAlignment && column !== void 0) {
          assertSheetHorizontalAlignment(value);
          super.addItem(row, column, value);
        }
      }
    }
  }

  /**
   * Stores an explicit non-default override, or removes the entry when left alignment is requested.
   * @param row - Zero-based row receiving the override.
   * @param col - Zero-based column receiving the override.
   * @param value - Requested horizontal alignment.
   * @returns This matrix after the sparse update.
   */
  public override addItem(row: number, col: number, value: string): this {
    assertSheetHorizontalAlignment(value);
    if (value === AlignmentMatrix.defaultAlignment) {
      this.removeItem(row, col);
      return this;
    }
    return super.addItem(row, col, value);
  }
}
