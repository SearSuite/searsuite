import { SheetMatrix } from '@searsuite/sear-domain-sheet';
import { AlignmentMatrix, VerticalAlignmentMatrix } from '@searsuite/sear-plugin-alignment';
import { CellFillMatrix } from '@searsuite/sear-plugin-cell-fill';
import { CellHighlightMatrix } from '@searsuite/sear-plugin-cell-highlight';
import { DataValidationMatrix } from '@searsuite/sear-plugin-data-validation';
import { SheetFilterMatrix } from '@searsuite/sear-plugin-filter';
import { type CellBorderMatrix } from '@searsuite/sear-plugin-cell-border';
import { DuplicateMatrix } from '@searsuite/sear-plugin-duplicate';
import { CellFormatMatrix } from '@searsuite/sear-plugin-cell-format';
import { FixedRowMatrix } from '@searsuite/sear-plugin-fixed-row';
import { SheetFreezeMatrix } from '@searsuite/sear-plugin-freeze';
import { CSRMatrix, ColumnShapeDimensionsCSRMatrix, RowShapeDimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';

import { type CellMergeMatrix } from '@searsuite/sear-plugin-cell-merge';

import { type SessionStateSnapshot } from '@searsuite/sear-assembly-plugin';

/** Document data owned by one sheet and eligible for future ExportPlugin serialization. */
export interface SheetDocumentState {
  sheetData: SheetMatrix;
  rowSizes: RowShapeDimensionsCSRMatrix;
  columnSizes: ColumnShapeDimensionsCSRMatrix;
  cellAlignments: AlignmentMatrix;
  /** Sparse vertical cell alignment state. */
  cellVerticalAlignments: VerticalAlignmentMatrix;
  /** Sparse cell fill state. */
  cellFills: CellFillMatrix;
  /** Sparse conditional highlight rules anchored at their range starts. */
  cellHighlights: CellHighlightMatrix;
  /** Sparse data validation rules anchored at range starts. */
  dataValidations?: DataValidationMatrix;
  /** Sheet-owned filter range and column rules. */
  filters?: SheetFilterMatrix;
  /** Sparse custom cell-edge state; absence initializes an empty border owner. */
  cellBorders?: CellBorderMatrix;
  /** Sparse duplicate-item highlight state. */
  duplicates: DuplicateMatrix;
  /** Sparse per-cell number-format state. */
  cellFormats: CellFormatMatrix;
  /** Sparse per-row fixed state. */
  fixedRows?: FixedRowMatrix;
  /** Persistent top and left freeze boundaries. */
  freeze?: SheetFreezeMatrix;
  rowHiddenOriginalSizes?: CSRMatrix<number>;
  columnHiddenOriginalSizes?: CSRMatrix<number>;
  cellMerges: CellMergeMatrix;
}
export type SheetSessionState = import('@searsuite/sear-assembly-plugin').SessionStateSnapshot;
