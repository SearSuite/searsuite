import { type OTEncodedValue } from '@searsuite/sear-domain-ot';

/** Current collaboration wire protocol version. */
export const CollaborationProtocolVersion = 1;

/** Versioned OT family identity carried on the wire. */
export interface CollaborationOperationType {
  readonly id: string;
  readonly version: number;
}

/** Client submission before the authority assigns a canonical revision. */
export interface CollaborationSubmission {
  readonly kind: 'submit';
  readonly protocolVersion: typeof CollaborationProtocolVersion;
  readonly resourceId: string;
  readonly clientId: string;
  readonly operationId: string;
  readonly ownerId: string;
  readonly operationType: CollaborationOperationType;
  readonly baseRevision: number;
  readonly payload: OTEncodedValue;
}

/** Canonical operation batch accepted and ordered by the authority. */
export interface CollaborationAcceptedBatch {
  readonly kind: 'accepted';
  readonly protocolVersion: typeof CollaborationProtocolVersion;
  readonly resourceId: string;
  readonly clientId: string;
  readonly operationId: string;
  readonly ownerId: string;
  readonly operationType: CollaborationOperationType;
  readonly baseRevision: number;
  readonly serverRevision: number;
  readonly payload: OTEncodedValue;
}

/** Ordered catch-up response sent when a transport joins a resource. */
export interface CollaborationSyncMessage {
  readonly kind: 'sync';
  readonly protocolVersion: typeof CollaborationProtocolVersion;
  readonly resourceId: string;
  readonly fromRevision: number;
  readonly serverRevision: number;
  readonly batches: readonly CollaborationAcceptedBatch[];
}

/** Explicit authority rejection; clients must not infer recovery from dropped frames. */
export interface CollaborationRejectedMessage {
  readonly kind: 'rejected';
  readonly protocolVersion: typeof CollaborationProtocolVersion;
  readonly resourceId: string;
  readonly operationId?: string;
  readonly code: string;
  readonly message: string;
}

export type CollaborationClientMessage = CollaborationSubmission;
export type CollaborationServerMessage =
  | CollaborationAcceptedBatch
  | CollaborationSyncMessage
  | CollaborationRejectedMessage;
