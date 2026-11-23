import { SearError } from '@searsuite/sear-foundation-error';

export class SheetSortError extends SearError {
  public override readonly code = 'SHEET_SORT_INVALID_INPUT';
  public constructor(message: string, details: Record<string, unknown>) { super(message, details); }
}
