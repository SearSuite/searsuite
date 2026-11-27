import { SearError } from '@searsuite/sear-foundation-error';

import { SearAssemblyErrorCode } from './SearAssemblyError';

/** Error thrown when a required registry entry is missing. */
export class SearRegistryEntryNotFoundError extends SearError {
  /** Stable machine-readable error code. */
  public readonly code = SearAssemblyErrorCode.registryEntryNotFound;

  /** Creates a SearRegistryEntryNotFoundError instance. */
  constructor(registry: string, key: string, message?: string) {
    super(message ?? `No ${registry} entry is registered for "${key}".`, {
      registry,
      key,
    });
  }
}
