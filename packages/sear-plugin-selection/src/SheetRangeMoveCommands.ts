import { defineSheetCommand, defineSheetQuery } from '@searsuite/sear-assembly-commands';
import { type SheetMoveRange } from '@searsuite/sear-assembly-plugin';

/** Moves a single rectangle to a new top-left coordinate on the same sheet. */
export interface MoveSheetRangeInput {
  readonly source: SheetMoveRange;
  readonly target: readonly [number, number];
  /** Explicit authorization to replace existing destination data. */
  readonly overwrite?: boolean;
}

export const MoveSheetRangeCommand = defineSheetCommand<MoveSheetRangeInput>('sheet.moveRange');
/** Validates a move and reports whether replacement requires user authorization. */
export const GetSheetRangeMoveConflict = defineSheetQuery<MoveSheetRangeInput, boolean>('sheet.moveRange.conflict');
