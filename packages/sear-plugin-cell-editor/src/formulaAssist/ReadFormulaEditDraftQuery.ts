import { defineSheetQuery } from '@searsuite/sear-assembly-commands';
import type { FormulaEditDraft } from './FormulaReferencePick';

/** Reads the active formula draft without changing the edit session. */
export const ReadFormulaEditDraftQuery = defineSheetQuery<void, FormulaEditDraft | null>('formula.readEditDraft');
