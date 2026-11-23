import { type WorkbookCellReference, type WorkbookId, type WorkbookSheetId } from '@searsuite/sear-domain-workbook';
import { type Transaction } from '@searsuite/sear-domain-transaction';
import { defineEventObservation, defineStateObservation } from '@searsuite/sear-foundation-subscription';

/** State snapshot for the workbook-scoped formula runtime. */
export interface WorkbookFormulaStateSnapshot {
  /** Workbook id currently observed by WorkbookFormulaPlugin. */
  readonly workbookId: WorkbookId | null;
  /** Active sheet id in the observed workbook state. */
  readonly activeSheetId: WorkbookSheetId | null;
  /** Sheet ids currently present in the observed workbook state. */
  readonly sheetIds: readonly WorkbookSheetId[];
  /** Number of formula cells currently indexed in the workbook dependency graph. */
  readonly formulaCellCount: number;
  /** Number of workbook formula cells waiting for recalculation. */
  readonly dirtyFormulaCellCount: number;
  /** Number of derived workbook formula results currently cached. */
  readonly cachedFormulaResultCount: number;
  /** Number of active-sheet transactions observed by companion Sheet plugins. */
  readonly observedSheetTransactionCount: number;
}

/** Local event emitted when a companion Sheet plugin observes a committed transaction. */
export interface WorkbookFormulaSheetTransactionEvent {
  /** Workbook sheet id that owned the active SheetEditor when the transaction committed. */
  readonly sheetId: WorkbookSheetId;
  /** Committed Sheet transaction observed from the active SheetEditor. */
  readonly transaction: Transaction;
}

/** WorkbookFormulaPlugin state exposed to diagnostic hosts. */
export const WorkbookFormulaStateObservation =
  defineStateObservation<WorkbookFormulaStateSnapshot>('workbookFormula.state');

/** WorkbookFormulaPlugin event stream for committed active-sheet transactions. */
export const WorkbookFormulaSheetTransactionObservation =
  defineEventObservation<WorkbookFormulaSheetTransactionEvent>('workbookFormula.sheetTransaction');

/** Formula results recalculated after a Workbook sheet-list change. */
export const WorkbookFormulaStructureResultsChangedObservation =
  defineEventObservation<readonly WorkbookCellReference[]>('workbookFormula.structureResultsChanged');
