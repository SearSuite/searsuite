import { type CellFormat } from '@searsuite/sear-domain-cell-types';

/** Read-only projection of one Sheet's persisted cell-format matrix. */
export interface SheetCellFormatReader {
  readonly shape: [number, number];
  getItem(row: number, column: number): CellFormat | null;
}
