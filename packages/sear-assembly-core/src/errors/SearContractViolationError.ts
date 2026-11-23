import { SearError, type SearErrorDetails } from '@searsuite/sear-foundation-error';

import { SearAssemblyErrorCode } from './SearAssemblyErrorCode';

/** Error thrown when an internal assembly contract is violated. */
export class SearContractViolationError extends SearError {
  /** Stable machine-readable error code. */
  public readonly code = SearAssemblyErrorCode.contractViolation;

  /** Creates a SearContractViolationError instance. */
  constructor(message: string, details: SearErrorDetails = {}) {
    super(message, details);
  }
}
