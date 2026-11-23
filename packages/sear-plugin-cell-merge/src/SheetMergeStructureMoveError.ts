import { SearError } from '@searsuite/sear-foundation-error';

/** A structure permutation would leave a merged range noncontiguous. */
export class SheetMergeStructureMoveError extends SearError {
  public override readonly code = 'SHEET_STRUCTURE_MOVE_SPLIT_MERGE';
  public constructor(range: readonly (readonly number[])[]) {
    super('Cannot reorder rows or columns across a merged cell.', { range });
  }
}
