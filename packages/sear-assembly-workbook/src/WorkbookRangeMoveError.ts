import { SearError } from '@searsuite/sear-foundation-error';

/** Prevents a same-sheet move from leaving workbook-qualified references stale. */
export class WorkbookRangeMoveError extends SearError {
  public override readonly code = 'WORKBOOK_RANGE_MOVE_QUALIFIED_REFERENCE';
  public constructor(sheetId: string) {
    super('This range has workbook-qualified dependents. Moving it requires a workbook-wide transaction.', { sheetId });
  }
}
