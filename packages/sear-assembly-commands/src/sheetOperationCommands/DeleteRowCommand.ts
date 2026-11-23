import { defineSheetCommand } from '../SheetCommandDefinition';
import { type SheetDeleteRowsInput } from './SheetStructureCommandTypes';

/** Deletes one or more rows starting at the requested row index. */
export const DeleteRowCommand = defineSheetCommand<SheetDeleteRowsInput>('sheet.deleteRows');
