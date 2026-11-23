import { SearError, type SearErrorDetails } from '@searsuite/sear-foundation-error';

/** Stable machine-readable errors raised by session-state contracts. */
export const SessionStateErrorCode = {
  invalidDefinition: 'SEAR_SESSION_STATE_INVALID_DEFINITION',
  invalidRestorePhase: 'SEAR_SESSION_STATE_INVALID_RESTORE_PHASE',
  invalidRestoreOrder: 'SEAR_SESSION_STATE_INVALID_RESTORE_ORDER',
  invalidRestoreDependency: 'SEAR_SESSION_STATE_INVALID_RESTORE_DEPENDENCY',
  restoreDependencyCycle: 'SEAR_SESSION_STATE_RESTORE_DEPENDENCY_CYCLE',
  snapshotNotLoaded: 'SEAR_SESSION_STATE_SNAPSHOT_NOT_LOADED',
  restorePhaseClosed: 'SEAR_SESSION_STATE_RESTORE_PHASE_CLOSED',
  restoreInProgress: 'SEAR_SESSION_STATE_RESTORE_IN_PROGRESS',
  registrationConflict: 'SEAR_SESSION_STATE_REGISTRATION_CONFLICT',
  snapshotNotDetached: 'SEAR_SESSION_STATE_SNAPSHOT_NOT_DETACHED',
} as const;

/** Supported session-state error codes. */
export type SessionStateErrorCode = (typeof SessionStateErrorCode)[keyof typeof SessionStateErrorCode];

/** Error raised when a session-state contributor violates its registry contract. */
export class SessionStateError extends SearError {
  /** Stable machine-readable error code. */
  public readonly code: SessionStateErrorCode;

  /** Creates a session-state contract error. */
  public constructor(code: SessionStateErrorCode, message: string, details: SearErrorDetails = {}) {
    super(message, details);
    this.code = code;
  }
}
