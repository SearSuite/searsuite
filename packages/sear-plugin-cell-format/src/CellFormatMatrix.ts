import { type CellFormat, normalizeCellFormat } from '@searsuite/sear-domain-cell-types';
import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import { CellFormatMatrixError } from './CellFormatMatrixError';

interface CellFormatMatrixData {
  readonly data: (CellFormat | null)[];
  readonly indices: number[];
  readonly indptr: number[];
}

/** Sparse matrix containing explicit per-cell number formats. */
export class CellFormatMatrix extends CSRMatrix<CellFormat | null> {
  public constructor(
    data: CellFormatMatrixData = { data: [], indices: [0], indptr: [] },
    shape: [number, number] = [0, 0],
  ) {
    super(void 0, shape);
    for (let row = 0; row < shape[0]; row += 1) {
      const start = data.indices[row] ?? 0;
      const end = data.indices[row + 1] ?? start;
      for (let index = start; index < end; index += 1) {
        const value = data.data[index];
        const column = data.indptr[index];
        if (column !== void 0 && value !== null) super.addItem(row, column, validateCellFormat(value));
      }
    }
  }

  /** Stores a validated format, or removes the sparse entry for null. */
  public setItem(row: number, column: number, format: CellFormat | null): this {
    if (format === null) {
      this.removeItem(row, column);
      return this;
    }
    return super.addItem(row, column, validateCellFormat(format));
  }

  /** Stores a format through the CSR API. */
  public override addItem(row: number, column: number, format: CellFormat | null): this {
    return this.setItem(row, column, format);
  }
}

function validateCellFormat(value: CellFormat): CellFormat {
  const normalized = normalizeCellFormat(value);
  if (normalized.kind !== 'general' || value.kind === 'general') return normalized;
  throw new CellFormatMatrixError('Sheet cell format is not a supported format definition.', { value });
}
