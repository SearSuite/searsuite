import { SearError } from '@searsuite/sear-foundation-error';
import { type SheetRangeMoveContext } from '@searsuite/sear-assembly-plugin';

/** A cell move that would split an existing merged range. */
export class SheetMergeRangeMoveError extends SearError {
  public override readonly code = 'SHEET_MOVE_SPLIT_MERGE';
  public constructor(context: SheetRangeMoveContext) {
    super('Cannot move a range that splits a merged cell.', { context });
  }
}
