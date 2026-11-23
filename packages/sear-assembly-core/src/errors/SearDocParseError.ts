import { SearError, type SearErrorDetails } from '@searsuite/sear-foundation-error';

import { SearAssemblyErrorCode } from './SearAssemblyErrorCode';

/** Error thrown when document input cannot be parsed. */
export class SearDocParseError extends SearError {
  /** Stable machine-readable error code. */
  public readonly code = SearAssemblyErrorCode.docParse;

  /** Creates a SearDocParseError instance. */
  constructor(message: string, details: SearErrorDetails = {}) {
    super(message, details);
  }
}
