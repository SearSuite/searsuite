import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { SearError } from '@searsuite/sear-foundation-error';
import { type HexColor } from '@searsuite/sear-foundation-utils';

/** A persisted duplicate-highlight color represented as a hexadecimal color. */
export type SheetDuplicateHighlight = HexColor;

/** Returns whether a value is a supported duplicate-highlight color. */
export function isSheetDuplicateHighlight(value: unknown): value is SheetDuplicateHighlight {
  return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);
}

/** Asserts that a value is a supported duplicate-highlight color. */
export function assertSheetDuplicateHighlight(value: unknown): asserts value is SheetDuplicateHighlight {
  if (!isSheetDuplicateHighlight(value)) {
    throw new SearError('Sheet duplicate highlight must be a hexadecimal color such as #ffe8e6.');
  }
}

/** Serialized sparse entries accepted by DuplicateMatrix. */
export interface DuplicateMatrixData {
  readonly data: (string | null)[];
  readonly indices: number[];
  readonly indptr: number[];
}

/** Sparse duplicate-highlight matrix. An absent cell has no duplicate marker. */
export class DuplicateMatrix extends CSRMatrix<SheetDuplicateHighlight | null> {
  /** Creates a sparse duplicate-highlight matrix from serialized CSR data. */
  public constructor(
    data: DuplicateMatrixData = { data: [], indices: [0], indptr: [] },
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
          assertSheetDuplicateHighlight(value);
          super.addItem(row, column, value);
        }
      }
    }
  }

  /** Stores a duplicate highlight. Null is represented by removing the sparse entry. */
  public setItem(row: number, col: number, value: SheetDuplicateHighlight | null): this {
    if (value === null) {
      this.removeItem(row, col);
      return this;
    }
    assertSheetDuplicateHighlight(value);
    return super.addItem(row, col, value);
  }

  /** Stores a duplicate highlight through the CSR API, removing the entry for null. */
  public override addItem(row: number, col: number, value: SheetDuplicateHighlight | null): this {
    return this.setItem(row, col, value);
  }
}
