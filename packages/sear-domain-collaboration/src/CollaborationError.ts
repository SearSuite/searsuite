import { SearError, type SearErrorDetails } from '@searsuite/sear-foundation-error';

/** Stable collaboration protocol and state-machine errors. */
export const CollaborationErrorCode = {
  InvalidIdentity: 'SEAR_COLLABORATION_INVALID_IDENTITY',
  InvalidProtocol: 'SEAR_COLLABORATION_INVALID_PROTOCOL',
  InvalidRevision: 'SEAR_COLLABORATION_INVALID_REVISION',
  RevisionGap: 'SEAR_COLLABORATION_REVISION_GAP',
  OwnerConflict: 'SEAR_COLLABORATION_OWNER_CONFLICT',
  OwnerNotRegistered: 'SEAR_COLLABORATION_OWNER_NOT_REGISTERED',
  OwnerTypeMismatch: 'SEAR_COLLABORATION_OWNER_TYPE_MISMATCH',
  OperationRejected: 'SEAR_COLLABORATION_OPERATION_REJECTED',
  AcknowledgementMismatch: 'SEAR_COLLABORATION_ACKNOWLEDGEMENT_MISMATCH',
  EngineDisconnected: 'SEAR_COLLABORATION_ENGINE_DISCONNECTED',
  RegistryDestroyed: 'SEAR_COLLABORATION_REGISTRY_DESTROYED',
} as const;

export type CollaborationErrorCode = (typeof CollaborationErrorCode)[keyof typeof CollaborationErrorCode];

/** Public collaboration failure with stable diagnostics. */
export class CollaborationError extends SearError {
  public override readonly code: CollaborationErrorCode;

  public constructor(code: CollaborationErrorCode, message: string, details: SearErrorDetails = {}) {
    super(message, details);
    this.code = code;
  }
}
