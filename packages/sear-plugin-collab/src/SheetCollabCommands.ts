import { defineSheetCommand, type SheetCommandResult } from '@searsuite/sear-assembly-commands';
import { type Operation } from '@searsuite/sear-domain-ot';
import { type CollaborationConnectOptions } from './CollaborationSession';
import { type CollaborationExternalEvent } from './CollaborationChannel';

/** Command result that resolves when the collaboration transport is connected. */
export interface ConnectSheetCollaborationResult extends SheetCommandResult {
  readonly completion: Promise<void>;
}

/** Starts a Sheet collaboration session through the editor command bus. */
export const ConnectSheetCollaborationCommand =
  defineSheetCommand<CollaborationConnectOptions, ConnectSheetCollaborationResult>('collaboration.connect');

/** Disconnects a Sheet collaboration session through the editor command bus. */
export const DisconnectSheetCollaborationCommand = defineSheetCommand('collaboration.disconnect');

/** Input for applying operations received from a collaboration transport. */
export interface SheetApplyRemoteOperationsInput {
  /** Stable collaboration owner id resolved through the local plugin registry. */
  readonly ownerId: string;
  /** Remote operations after local OT transformation. */
  readonly operations: readonly Operation[];
}

/** Command that applies remote collaboration operations through the normal pipeline. */
export const ApplyRemoteOperationsCommand = defineSheetCommand<SheetApplyRemoteOperationsInput>(
  'collaboration.applyRemoteOperations',
);

/** Routes an external transport event into the owning Sheet command bus. */
export const ApplySheetCollaborationEventCommand = defineSheetCommand<CollaborationExternalEvent>(
  'collaboration.applyTransportEvent',
);
