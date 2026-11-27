import { type WorkbookCellReference } from '@searsuite/sear-domain-workbook';
import { defineWorkbookCommand } from './WorkbookCommandDefinition';

/** Result returned after recalculating workbook-level dirty formulas. */
export interface RecalculateWorkbookFormulasCommandResult {
  /** Formula cells recalculated by this command. */
  readonly recalculatedCells: readonly WorkbookCellReference[];
  /** Formula cells still dirty after the command completes. */
  readonly remainingDirtyCells: readonly WorkbookCellReference[];
}

/** Recalculates workbook-level formulas marked dirty by cross-sheet changes. */
export const RecalculateWorkbookFormulasCommand = defineWorkbookCommand<void, RecalculateWorkbookFormulasCommandResult>(
  'workbookFormula.recalculateDirty',
);

/** Rebuilds workbook formula indexes for a committed Sheet transaction. */
export const ProcessCommittedSheetFormulaTransactionCommand = defineWorkbookCommand<void, void>(
  'workbookFormula.processCommittedSheetTransaction',
);

/** Synchronizes derived formula indexes after a committed Workbook document change. */
export const SynchronizeWorkbookFormulaStateCommand = defineWorkbookCommand<void, void>(
  'workbookFormula.synchronizeDocumentState',
);

/** Recalculates formulas affected by an external service change. */
export const InvalidateWorkbookFormulaExternalServiceCommand = defineWorkbookCommand<string, void>(
  'workbookFormula.externalService.invalidate',
);

/** Recalculates formulas affected by function registration changes. */
export const InvalidateWorkbookFormulaFunctionsCommand = defineWorkbookCommand<readonly string[], void>(
  'workbookFormula.functions.invalidate',
);

/** Removes one workbook-owned function contribution by its registration id. */
export const UnregisterWorkbookFormulaFunctionCommand = defineWorkbookCommand<number, void>(
  'workbookFormula.function.unregister',
);
/** Removes one workbook-owned external formula service contribution. */
export const UnregisterWorkbookFormulaExternalServiceCommand = defineWorkbookCommand<number, void>(
  'workbookFormula.externalService.unregister',
);
/** Removes one workbook-owned text formula service contribution. */
export const UnregisterWorkbookFormulaTextServiceCommand = defineWorkbookCommand<number, void>(
  'workbookFormula.textService.unregister',
);
