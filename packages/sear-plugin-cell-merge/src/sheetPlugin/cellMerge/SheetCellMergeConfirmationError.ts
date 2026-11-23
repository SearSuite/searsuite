import { SearError } from '@searsuite/sear-foundation-error';

export class SheetCellMergeConfirmationError extends SearError {
  public override readonly code = 'SHEET_MERGE_CONFIRMATION_REQUIRED';

  public constructor(reason: 'required' | 'changed') {
    super('Merging these cells would discard contents outside the first occupied cell.', { reason });
  }
}
