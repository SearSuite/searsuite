import { defineSheetReaderQuery } from '@searsuite/sear-assembly-commands';
import { type SheetCellFormatReader } from './SheetCellFormatReader';

/** Reads the active Sheet's live, read-only cell-format projection. */
export const ReadSheetCellFormatQuery = defineSheetReaderQuery<void, SheetCellFormatReader>('sheet.cellFormat.read');
