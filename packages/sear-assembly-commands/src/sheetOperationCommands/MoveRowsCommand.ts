import { defineSheetCommand } from '../SheetCommandDefinition';
import { type SheetMoveAxisInput } from './SheetMoveAxisInput';

/** Reorders complete rows without overwriting their neighbors. */
export const MoveRowsCommand = defineSheetCommand<SheetMoveAxisInput>('sheet.moveRows');
