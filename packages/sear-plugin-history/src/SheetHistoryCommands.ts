import { defineSheetCommand } from '@searsuite/sear-assembly-commands';

/** Reverts the latest successfully committed sheet mutation. */
export const UndoSheetCommand = defineSheetCommand<void>('sheet.undo');

/** Reapplies the latest sheet mutation reverted by undo. */
export const RedoSheetCommand = defineSheetCommand<void>('sheet.redo');
