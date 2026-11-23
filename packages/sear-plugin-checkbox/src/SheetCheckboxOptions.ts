import { type CursorRegistry } from '@searsuite/sear-render-cursor';
import { type CellMatrixElement, SheetCellInputValidationRegistry } from '@searsuite/sear-domain-cell-types';
import { type CellTypeCatalog } from '@searsuite/sear-domain-cell';
import { type Transaction } from '@searsuite/sear-domain-transaction';
import { type CellFormulaValueConverterRegistry } from '@searsuite/sear-plugin-formula';
import { type SheetRangeInput } from '@searsuite/sear-assembly-commands';
/** Planned update owned by the ordinary cell-data plugin. */
export interface CheckboxCellWrite {
  /** Absolute row. */ readonly row: number;
  /** Absolute column. */ readonly column: number;
  /** Replacement cell; null clears it. */ readonly cell: CellMatrixElement | null;
}
/** Editor-local dependencies; checkbox state stays in the cell-data owner. */
export interface SheetCheckboxOptions {
  /** Optional editor-local cursor registry. */ readonly cursor?: CursorRegistry;
  /** Cell-type extension catalog. */ readonly catalog: CellTypeCatalog;
  /** Formula converter registry, when formula support is installed. */ readonly formulas?: CellFormulaValueConverterRegistry;
  /** Shared cell-edit validation registry. */ readonly inputValidation?: SheetCellInputValidationRegistry;
  /** Reads current Sheet dimensions. */ readShape(): readonly [number, number];
  /** Reads current persisted cell values. */ readCell(row: number, column: number): CellMatrixElement | null;
  /** True when a merged range hides this coordinate behind its anchor. */ isMergedCoveredCell?(
    row: number,
    column: number,
  ): boolean;
  /** Visits persisted sparse entries inside the inclusive selection. */ forEachStored(
    range: SheetRangeInput,
    visit: (cell: CellMatrixElement | null, row: number, column: number) => void,
  ): void;
  /** Creates a semantic cell-owner transaction without mutating live data. */ createTransaction(
    writes: readonly CheckboxCellWrite[],
  ): Transaction;
  /** Reports a checkbox validation rule, including cells currently showing warning text. */ hasCheckboxRule?(
    row: number,
    column: number,
  ): boolean;
  /** Rejects incompatible existing validation on direct checkbox commands. */ validateValue?(
    row: number,
    column: number,
    text: string,
  ): { readonly reject: boolean; readonly message?: string };
  /** Allows the composition root to commit or reject an active edit before pointer toggling. */ beforeToggle?(): boolean;
}
