import { SearError } from '@searsuite/sear-foundation-error';

import { SearAssemblyErrorCode } from './SearAssemblyError';

/** Error thrown when a pipeline step kind has no registered executor. */
export class SearPipelineStepExecutorNotFoundError extends SearError {
  /** Stable machine-readable error code. */
  public readonly code = SearAssemblyErrorCode.pipelineStepExecutorNotFound;

  /** Creates a SearPipelineStepExecutorNotFoundError instance. */
  constructor(kind: string) {
    super(`No pipeline step executor is registered for "${kind}".`, { kind });
  }
}
