import { defineSheetCommand } from '../SheetCommandDefinition';
import { type SheetInsertRowsInput } from './SheetStructureCommandTypes';

/** Inserts one or more rows before the requested row index. */
export const InsertRowCommand = defineSheetCommand<SheetInsertRowsInput>('sheet.insertRows');
