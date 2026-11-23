import { SearError, type SearErrorDetails } from '@searsuite/sear-foundation-error';

/** Stable machine-readable errors raised by runtime capability registries. */
export const RuntimeCapabilityErrorCode = {
  InvalidDefinition: 'SEAR_RUNTIME_CAPABILITY_INVALID_DEFINITION',
  RegistrationConflict: 'SEAR_RUNTIME_CAPABILITY_REGISTRATION_CONFLICT',
  NotRegistered: 'SEAR_RUNTIME_CAPABILITY_NOT_REGISTERED',
  RegistryDestroyed: 'SEAR_RUNTIME_CAPABILITY_REGISTRY_DESTROYED',
} as const;

/** Supported runtime capability error codes. */
export type RuntimeCapabilityErrorCode = (typeof RuntimeCapabilityErrorCode)[keyof typeof RuntimeCapabilityErrorCode];

/** Public error raised when a runtime capability contract is violated. */
export class RuntimeCapabilityError extends SearError {
  public override readonly code: RuntimeCapabilityErrorCode;

  public constructor(code: RuntimeCapabilityErrorCode, message: string, details: SearErrorDetails = {}) {
    super(message, details);
    this.code = code;
  }
}
