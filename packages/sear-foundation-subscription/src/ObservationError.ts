import { SearError, type SearErrorDetails } from '@searsuite/sear-foundation-error';

/** Stable machine-readable error codes for the observation extension surface. */
export const ObservationErrorCode = {
  InvalidDefinition: 'SEAR_OBSERVATION_INVALID_DEFINITION',
  AlreadyRegistered: 'SEAR_OBSERVATION_ALREADY_REGISTERED',
  NotRegistered: 'SEAR_OBSERVATION_NOT_REGISTERED',
  DefinitionMismatch: 'SEAR_OBSERVATION_DEFINITION_MISMATCH',
  SnapshotUnavailable: 'SEAR_OBSERVATION_SNAPSHOT_UNAVAILABLE',
  RegistryDestroyed: 'SEAR_OBSERVATION_REGISTRY_DESTROYED',
} as const;

/** Machine-readable observation error code. */
export type ObservationErrorCode = (typeof ObservationErrorCode)[keyof typeof ObservationErrorCode];

/** Public error raised when an observation definition or registry lifecycle contract is violated. */
export class ObservationError extends SearError {
  /** Stable observation-specific error code. */
  public override readonly code: ObservationErrorCode;

  /** Creates an observation contract error with structured diagnostic details. */
  public constructor(code: ObservationErrorCode, message: string, details: SearErrorDetails = {}) {
    super(message, details);
    this.code = code;
  }
}
