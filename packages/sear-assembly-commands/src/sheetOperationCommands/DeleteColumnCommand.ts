import { defineSheetCommand } from '../SheetCommandDefinition';
import { type SheetDeleteColumnsInput } from './SheetStructureCommandTypes';

/** Deletes one or more columns starting at the requested column index. */
export const DeleteColumnCommand = defineSheetCommand<SheetDeleteColumnsInput>('sheet.deleteColumns');
