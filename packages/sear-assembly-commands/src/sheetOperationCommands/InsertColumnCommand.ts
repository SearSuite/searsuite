import { defineSheetCommand } from '../SheetCommandDefinition';
import { type SheetInsertColumnsInput } from './SheetStructureCommandTypes';

/** Inserts one or more columns before the requested column index. */
export const InsertColumnCommand = defineSheetCommand<SheetInsertColumnsInput>('sheet.insertColumns');
