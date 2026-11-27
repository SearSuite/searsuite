import { defineSheetCommand } from '@searsuite/sear-assembly-commands';

/** Requests activation of hyperlink metadata owned by a calculated cell. */
export const ActivateFormulaHyperlinkCommand = defineSheetCommand<{ row: number; column: number }>(
  'sheet.formula.activateHyperlink',
);
