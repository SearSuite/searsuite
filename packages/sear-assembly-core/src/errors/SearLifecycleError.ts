import { SearError } from '@searsuite/sear-foundation-error';

import { SearAssemblyErrorCode } from './SearAssemblyErrorCode';

/** Error thrown for invalid sheet lifecycle transitions. */
export class SearLifecycleError extends SearError {
  /** Stable machine-readable error code. */
  public readonly code = SearAssemblyErrorCode.lifecycleInvalidState;

  /** Creates a SearLifecycleError instance. */
  constructor(operation: string, state: string, message?: string) {
    super(message ?? `Cannot ${operation} when the sheet lifecycle is ${state}.`, {
      operation,
      state,
    });
  }
}
