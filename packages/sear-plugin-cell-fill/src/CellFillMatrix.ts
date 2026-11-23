import { SearError } from '@searsuite/sear-foundation-error';
import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { type HexColor } from '@searsuite/sear-foundation-utils';

/** A persisted cell fill color represented as a CSS-compatible hexadecimal color. */
export type SheetCellFill = HexColor;

/** Returns whether a value is a supported cell fill color. */
export function isSheetCellFill(value: unknown): value is SheetCellFill {
  return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);
}

/** Asserts that a value is a supported cell fill color. */
export function assertSheetCellFill(value: unknown): asserts value is SheetCellFill {
  if (!isSheetCellFill(value)) {
    throw new SearError('Sheet cell fill must be a hexadecimal color such as #ffffff.');
  }
}

/** Serialized sparse entries accepted by CellFillMatrix. */
export interface CellFillMatrixData {
  readonly data: (string | null)[];
  readonly indices: number[];
  readonly indptr: number[];
}

/** Sparse cell-fill matrix. An absent cell has no fill. */
export class CellFillMatrix extends CSRMatrix<SheetCellFill | null> {
  /** Creates a sparse cell-fill matrix from serialized CSR data. */
  public constructor(
    data: CellFillMatrixData = { data: [], indices: [0], indptr: [] },
    shape: [number, number] = [0, 0],
  ) {
    super(void 0, shape);
    for (let row = 0; row < shape[0]; row += 1) {
      const start = data.indices[row] ?? 0;
      const end = data.indices[row + 1] ?? start;
      for (let index = start; index < end; index += 1) {
        const value = data.data[index];
        const column = data.indptr[index];
        if (column !== void 0 && value !== null) {
          assertSheetCellFill(value);
          super.addItem(row, column, value);
        }
      }
    }
  }

  /** Stores a fill color. Null is represented by removing the sparse entry. */
  public setItem(row: number, col: number, value: SheetCellFill | null): this {
    if (value === null) {
      this.removeItem(row, col);
      return this;
    }
    assertSheetCellFill(value);
    return super.addItem(row, col, value);
  }

  /** Stores a fill color through the CSR API, removing the entry for null. */
  public override addItem(row: number, col: number, value: SheetCellFill | null): this {
    return this.setItem(row, col, value);
  }
}
