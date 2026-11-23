/**
 * Editor bridges that connect committed collaborative transactions to host transports.
 *
 * @packageDocumentation
 */

export {
  ApplyRemoteOperationsCommand,
  ApplySheetCollaborationEventCommand,
  ConnectSheetCollaborationCommand,
  DisconnectSheetCollaborationCommand,
  type ConnectSheetCollaborationResult,
  type SheetApplyRemoteOperationsInput,
} from './SheetCollabCommands';
export { CollabTransport, type CollaborationTransportConnectOptions } from './CollabTransport';
export { HeadlessCollabTransport } from './HeadlessCollabTransport';
export {
  CollaborationChannel,
  CollaborationChannelBinding,
  type CollaborationRemoteOperationApplier,
  type CollaborationRemoteOperations,
  type CollaborationExternalEvent,
} from './CollaborationChannel';
export {
  CollaborationChannelError,
  CollaborationChannelErrorCode,
  type CollaborationChannelErrorCode as CollaborationChannelErrorCodeType,
} from './CollaborationChannelError';
export { SheetCollaborationPlugin } from './sheetCollaboration/SheetCollaborationPlugin';
export { CollaborationStatusObservation } from './CollaborationObservation';
export { type CollaborationConnectOptions, type CollaborationSession } from './CollaborationSession';
export {
  CollaborationConnectionState,
  type CollaborationConnectionState as CollaborationConnectionStateType,
  type CollaborationStatus,
} from './CollaborationStatus';
export type {
  CollaborationAcceptedBatch,
  CollaborationClientMessage,
  CollaborationRejectedMessage,
  CollaborationServerMessage,
  CollaborationSubmission,
  CollaborationSyncMessage,
} from '@searsuite/sear-domain-collaboration';
export { CollaborationProtocolVersion } from '@searsuite/sear-domain-collaboration';
