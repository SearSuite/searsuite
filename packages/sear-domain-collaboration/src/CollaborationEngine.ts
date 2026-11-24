import {
  OTTransformPriority,
  transactionOTTypeKey,
  type OTOperation,
  type TransactionOTDefinition,
} from '@searsuite/sear-domain-ot';
import { CollaborationContributorRegistry } from './CollaborationContributorRegistry';
import { CollaborationError, CollaborationErrorCode } from './CollaborationError';
import {
  CollaborationProtocolVersion,
  type CollaborationAcceptedBatch,
  type CollaborationRejectedMessage,
  type CollaborationServerMessage,
  type CollaborationSubmission,
} from './CollaborationProtocol';

interface PendingBatch {
  readonly operationId: string;
  readonly ownerId: string;
  readonly definition: TransactionOTDefinition;
  operations: OTOperation[];
}

/** Effects emitted by the pure collaboration client state machine. */
export type CollaborationEngineEffect =
  | { readonly kind: 'send'; readonly submission: CollaborationSubmission }
  | {
      readonly kind: 'applyRemote';
      readonly ownerId: string;
      readonly operations: readonly OTOperation[];
      readonly serverRevision: number;
    };

/** Single client-side collaboration algorithm shared by all editor bridges. */
export class CollaborationEngine {
  readonly #contributors: CollaborationContributorRegistry;

  readonly #pending: PendingBatch[] = [];
  #resourceId: string | null = null;
  #clientId: string | null = null;
  #serverRevision = 0;
  #nextOperationSequence = 1;

  public constructor(contributors: CollaborationContributorRegistry) {
    this.#contributors = contributors;
  }

  /** Starts one resource session from a host-supplied document revision. */
  public connect(resourceId: string, clientId: string, revision: number = 0): void {
    if (!resourceId.trim() || !clientId.trim()) {
      throw new CollaborationError(
        CollaborationErrorCode.InvalidIdentity,
        'Collaboration resource and client ids must not be empty.',
        { resourceId, clientId },
      );
    }
    if (!Number.isInteger(revision) || revision < 0) {
      throw new CollaborationError(
        CollaborationErrorCode.InvalidRevision,
        `Collaboration revision ${revision} must be a non-negative integer.`,
        { revision },
      );
    }
    this.#resourceId = resourceId;
    this.#clientId = clientId;
    this.#serverRevision = revision;
    this.#pending.length = 0;
    this.#nextOperationSequence = 1;
  }

  /** Ends the current session and releases transient pending state. */
  public disconnect(): void {
    this.#resourceId = null;
    this.#clientId = null;
    this.#serverRevision = 0;
    this.#pending.length = 0;
    this.#nextOperationSequence = 1;
  }

  /** Queues one already-committed local transaction and emits at most one in-flight submission. */
  public submitLocal<OperationType extends OTOperation>(
    ownerId: string,
    operations: readonly OperationType[],
  ): readonly CollaborationEngineEffect[] {
    const session = this.#requireSession();
    const definition = this.#contributors.require(ownerId);
    const operationId = `${session.clientId}:${this.#nextOperationSequence++}`;
    const pending: PendingBatch = { operationId, ownerId, definition, operations: [...operations] };
    this.#pending.push(pending);
    return this.#pending.length === 1 ? [this.#createSendEffect(pending)] : [];
  }

  /** Applies one authority message and returns host/transport effects in deterministic order. */
  public receive(message: CollaborationServerMessage): readonly CollaborationEngineEffect[] {
    const session = this.#requireSession();
    if (message.protocolVersion !== CollaborationProtocolVersion || message.resourceId !== session.resourceId) {
      throw new CollaborationError(
        CollaborationErrorCode.InvalidProtocol,
        'Collaboration message does not belong to the active protocol session.',
        { resourceId: message.resourceId, expectedResourceId: session.resourceId },
      );
    }
    if (message.kind === 'rejected') return this.#handleRejected(message);
    if (message.kind === 'sync') {
      if (message.fromRevision !== this.#serverRevision) {
        throw this.#revisionGap(message.fromRevision);
      }
      const effects: CollaborationEngineEffect[] = [];
      message.batches.forEach((batch) => effects.push(...this.#receiveAccepted(batch)));
      if (this.#serverRevision !== message.serverRevision) throw this.#revisionGap(message.serverRevision);
      return effects;
    }
    return this.#receiveAccepted(message);
  }

  public getRevision(): number {
    return this.#serverRevision;
  }

  public getPendingCount(): number {
    return this.#pending.length;
  }

  #receiveAccepted(batch: CollaborationAcceptedBatch): CollaborationEngineEffect[] {
    if (batch.serverRevision <= this.#serverRevision) return [];
    if (batch.serverRevision !== this.#serverRevision + 1) throw this.#revisionGap(batch.serverRevision);
    const definition = this.#contributors.require(batch.ownerId, batch.operationType);
    let remoteOperations = this.#contributors.operations.decode(
      batch.operationType.id,
      batch.operationType.version,
      batch.payload,
    );
    const ownIndex = this.#pending.findIndex(({ operationId }) => operationId === batch.operationId);
    const effects: CollaborationEngineEffect[] = [];
    if (ownIndex === 0) {
      const own = this.#pending.shift();
      if (
        !own ||
        own.ownerId !== batch.ownerId ||
        transactionOTTypeKey(own.definition) !== transactionOTTypeKey(definition)
      ) {
        throw new CollaborationError(
          CollaborationErrorCode.AcknowledgementMismatch,
          `Acknowledgement "${batch.operationId}" does not match the in-flight transaction.`,
          { operationId: batch.operationId },
        );
      }
      this.#serverRevision = batch.serverRevision;
      const next = this.#pending[0];
      if (next) effects.push(this.#createSendEffect(next));
      return effects;
    }
    if (ownIndex > 0) {
      throw new CollaborationError(
        CollaborationErrorCode.AcknowledgementMismatch,
        `Acknowledgement "${batch.operationId}" arrived before an earlier local transaction.`,
        { operationId: batch.operationId },
      );
    }
    for (const local of this.#pending) {
      const transformed = this.#contributors.operations.transformPair(
        definition,
        remoteOperations,
        local.definition,
        local.operations,
        priorityFor(batch.operationId, local.operationId),
      );
      remoteOperations = transformed.left;
      local.operations = transformed.right;
    }
    this.#serverRevision = batch.serverRevision;
    if (remoteOperations.length > 0) {
      effects.push({
        kind: 'applyRemote',
        ownerId: batch.ownerId,
        operations: remoteOperations,
        serverRevision: batch.serverRevision,
      });
    }
    return effects;
  }

  #handleRejected(message: CollaborationRejectedMessage): never {
    throw new CollaborationError(CollaborationErrorCode.OperationRejected, message.message, {
      resourceId: message.resourceId,
      operationId: message.operationId,
      authorityCode: message.code,
    });
  }

  #createSendEffect(pending: PendingBatch): CollaborationEngineEffect {
    const session = this.#requireSession();
    return {
      kind: 'send',
      submission: {
        kind: 'submit',
        protocolVersion: CollaborationProtocolVersion,
        resourceId: session.resourceId,
        clientId: session.clientId,
        operationId: pending.operationId,
        ownerId: pending.ownerId,
        operationType: { id: pending.definition.id, version: pending.definition.version },
        baseRevision: this.#serverRevision,
        payload: this.#contributors.operations.encode(pending.definition, pending.operations),
      },
    };
  }

  #requireSession(): { resourceId: string; clientId: string } {
    if (this.#resourceId && this.#clientId) return { resourceId: this.#resourceId, clientId: this.#clientId };
    throw new CollaborationError(CollaborationErrorCode.EngineDisconnected, 'Collaboration engine is not connected.');
  }

  #revisionGap(receivedRevision: number): CollaborationError {
    return new CollaborationError(
      CollaborationErrorCode.RevisionGap,
      `Expected collaboration revision ${this.#serverRevision + 1}, received ${receivedRevision}.`,
      { expectedRevision: this.#serverRevision + 1, receivedRevision },
    );
  }
}

function priorityFor(leftOperationId: string, rightOperationId: string): OTTransformPriority {
  return leftOperationId.localeCompare(rightOperationId) <= 0 ? OTTransformPriority.LEFT : OTTransformPriority.RIGHT;
}
