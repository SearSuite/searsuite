import { defineSheetQuery } from '@searsuite/sear-assembly-commands';
import { type SheetRangeMoveAnalysis } from '@searsuite/sear-assembly-plugin';
import { type MoveSheetRangeInput } from './SheetRangeMoveCommands';

/** Reads the latest legal destination and owner constraints for a range move. */
export const AnalyzeSheetRangeMove = defineSheetQuery<MoveSheetRangeInput, SheetRangeMoveAnalysis>(
  'sheet.moveRange.analyze',
);
