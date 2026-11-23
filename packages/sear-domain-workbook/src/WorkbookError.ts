import { SearError, type SearErrorDetails } from '@searsuite/sear-foundation-error';

import { type WorkbookErrorCode } from './WorkbookErrorCode';

/** Error thrown when workbook state or workbook references violate their domain contract. */
export class WorkbookError extends SearError {
  /** Stable machine-readable error code. */
  public override readonly code: WorkbookErrorCode;

  /** Creates a WorkbookError instance. */
  constructor(code: WorkbookErrorCode, message: string, details: SearErrorDetails = {}) {
    super(message, details);
    this.code = code;
  }
}
