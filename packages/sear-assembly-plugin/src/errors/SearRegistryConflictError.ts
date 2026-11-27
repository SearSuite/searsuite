import { SearError } from '@searsuite/sear-foundation-error';

import { SearAssemblyErrorCode } from './SearAssemblyError';

/** Error thrown when a registry key is registered more than once. */
export class SearRegistryConflictError extends SearError {
  /** Stable machine-readable error code. */
  public readonly code = SearAssemblyErrorCode.registryConflict;

  /** Creates a SearRegistryConflictError instance. */
  constructor(registry: string, key: string, message?: string) {
    super(message ?? `A ${registry} entry for "${key}" is already registered.`, {
      registry,
      key,
    });
  }
}
