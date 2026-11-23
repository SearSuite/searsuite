import { defineSheetCommand } from '../SheetCommandDefinition';
import { type SheetMoveAxisInput } from './SheetMoveAxisInput';

/** Reorders complete columns without overwriting their neighbors. */
export const MoveColumnsCommand = defineSheetCommand<SheetMoveAxisInput>('sheet.moveColumns');
