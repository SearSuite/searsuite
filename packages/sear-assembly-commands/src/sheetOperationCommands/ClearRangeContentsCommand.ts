import { defineSheetCommand } from '../SheetCommandDefinition';
import { type SheetClearRangeContentsInput } from './SheetRangeCommandTypes';

/** Clears persisted cell contents in an explicit rectangular range. */
export const ClearRangeContentsCommand = defineSheetCommand<SheetClearRangeContentsInput>('range.clearContents');
