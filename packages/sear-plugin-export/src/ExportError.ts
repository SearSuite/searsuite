import { SearError, type SearErrorDetails } from '@searsuite/sear-foundation-error';

import { type ExportErrorCode } from './ExportErrorCode';

/** Error thrown when a persisted workbook payload cannot be encoded or decoded. */
export class ExportError extends SearError {
  /** Stable machine-readable error code. */
  public override readonly code: ExportErrorCode;

  /** Creates an ExportError instance. */
  public constructor(code: ExportErrorCode, message: string, details: SearErrorDetails = {}) {
    super(message, details);
    this.code = code;
  }
}
