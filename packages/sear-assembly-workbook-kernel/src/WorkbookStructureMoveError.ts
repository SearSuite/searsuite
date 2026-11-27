import { SearError } from '@searsuite/sear-foundation-error';

/** Prevents an axis move from leaving qualified reference sources outside its transaction stale. */
export class WorkbookStructureMoveError extends SearError {
  public override readonly code = 'WORKBOOK_STRUCTURE_MOVE_QUALIFIED_REFERENCE';
  public constructor(sheetId: string) {
    super(
      'These rows or columns have workbook-qualified dependents. Reordering them requires a workbook-wide transaction.',
      { sheetId },
    );
  }
}
