import type { Point } from '@searsuite/sear-foundation-rect';
import { defineWorkbookCommand } from '../../WorkbookCommandDefinition';

/** Retains the source formula draft before activating another sheet. */
export const CaptureWorkbookFormulaDraftCommand = defineWorkbookCommand('workbookFormula.captureDraft');

/** Applies a picked range to the retained formula draft. */
export const PickWorkbookFormulaReferenceCommand = defineWorkbookCommand<{
  readonly start: Point;
  readonly end: Point;
}>('workbookFormula.pickReference');

/** Cancels a pending cross-sheet reference pick. */
export const CancelWorkbookFormulaReferencePickCommand = defineWorkbookCommand('workbookFormula.cancelReferencePick');

/** Restores the retained draft when the source sheet becomes active again. */
export const RestoreWorkbookFormulaDraftCommand = defineWorkbookCommand('workbookFormula.restoreDraft');
