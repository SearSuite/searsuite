import { SearError, type SearErrorDetails } from '@searsuite/sear-foundation-error';

import { type MatrixSerializationErrorCode } from './MatrixSerializationErrorCode';

/** Error thrown when a persisted sparse matrix payload cannot be decoded. */
export class MatrixSerializationError extends SearError {
  /** Stable machine-readable error code. */
  public override readonly code: MatrixSerializationErrorCode;

  /** Creates a MatrixSerializationError instance. */
  public constructor(code: MatrixSerializationErrorCode, message: string, details: SearErrorDetails = {}) {
    super(message, details);
    this.code = code;
  }
}
