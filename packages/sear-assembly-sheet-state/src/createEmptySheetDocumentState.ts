import { CSRMatrix, ColumnShapeDimensionsCSRMatrix, RowShapeDimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { SearError } from '@searsuite/sear-foundation-error';
import { AlignmentMatrix, VerticalAlignmentMatrix } from '@searsuite/sear-plugin-alignment';
import { CellFillMatrix } from '@searsuite/sear-plugin-cell-fill';
import { CellHighlightMatrix } from '@searsuite/sear-plugin-cell-highlight';
import { DataValidationMatrix } from '@searsuite/sear-plugin-data-validation';
import { SheetFilterMatrix } from '@searsuite/sear-plugin-filter';
import { CellFormatMatrix } from '@searsuite/sear-plugin-cell-format';
import { CellMergeMatrix } from '@searsuite/sear-plugin-cell-merge';
import { DuplicateMatrix } from '@searsuite/sear-plugin-duplicate';
import { FixedRowMatrix } from '@searsuite/sear-plugin-fixed-row';
import { SheetFreezeMatrix } from '@searsuite/sear-plugin-freeze';
import { SheetMatrix } from '@searsuite/sear-domain-sheet';
import type { SheetDocumentState } from './SheetDocumentState';

/** Creates an empty Sheet document with matching dimensions for import adapters. */
export function createEmptySheetDocumentState(rowCount: number, columnCount: number): SheetDocumentState {
  if (!Number.isSafeInteger(rowCount) || rowCount < 1 || !Number.isSafeInteger(columnCount) || columnCount < 1) {
    throw new SearError('Sheet dimensions must be positive safe integers.');
  }
  const shape: [number, number] = [rowCount, columnCount];
  const rowSizes = new RowShapeDimensionsCSRMatrix(void 0, [1, rowCount]);
  const columnSizes = new ColumnShapeDimensionsCSRMatrix(void 0, [1, columnCount]);
  rowSizes.setDefaultValue(24);
  columnSizes.setDefaultValue(100);
  return {
    sheetData: new SheetMatrix(void 0, shape),
    rowSizes,
    columnSizes,
    cellAlignments: new AlignmentMatrix(void 0, shape),
    cellVerticalAlignments: new VerticalAlignmentMatrix(void 0, shape),
    cellFills: new CellFillMatrix(void 0, shape),
    cellHighlights: new CellHighlightMatrix(void 0, shape),
    dataValidations: new DataValidationMatrix(void 0, shape),
    filters: new SheetFilterMatrix(),
    duplicates: new DuplicateMatrix(void 0, shape),
    cellFormats: new CellFormatMatrix(void 0, shape),
    fixedRows: new FixedRowMatrix(void 0, [1, rowCount]),
    freeze: new SheetFreezeMatrix(),
    rowHiddenOriginalSizes: new CSRMatrix<number>(void 0, [1, rowCount]),
    columnHiddenOriginalSizes: new CSRMatrix<number>(void 0, [1, columnCount]),
    cellMerges: new CellMergeMatrix(void 0, shape),
  };
}
