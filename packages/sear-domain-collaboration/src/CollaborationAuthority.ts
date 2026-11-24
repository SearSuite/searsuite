import { OTTransformPriority, type OTOperation, type TransactionOTDefinition } from '@searsuite/sear-domain-ot';
import { CollaborationContributorRegistry } from './CollaborationContributorRegistry';
import { CollaborationError, CollaborationErrorCode } from './CollaborationError';
import {
  CollaborationProtocolVersion,
  type CollaborationAcceptedBatch,
  type CollaborationSubmission,
  type CollaborationSyncMessage,
} from './CollaborationProtocol';

interface DecodedAcceptedBatch {
  readonly batch: CollaborationAcceptedBatch;
  readonly definition: TransactionOTDefinition;
  readonly operations: readonly OTOperation[];
}

interface CollaborationResourceLog {
  readonly accepted: DecodedAcceptedBatch[];
  readonly byOperationId: Map<string, CollaborationAcceptedBatch>;
}

/** In-memory authority that validates, rebases, orders, and deduplicates collaboration batches. */
export class CollaborationAuthority {
  readonly #contributors: CollaborationContributorRegistry;

  readonly #resources = new Map<string, CollaborationResourceLog>();

  public constructor(contributors: CollaborationContributorRegistry) {
    this.#contributors = contributors;
  }

  /** Accepts one client submission into the canonical resource order. */
  public accept(submission: CollaborationSubmission): CollaborationAcceptedBatch {
    assertProtocol(submission.protocolVersion);
    assertIdentity(submission.resourceId, 'resourceId');
    assertIdentity(submission.clientId, 'clientId');
    assertIdentity(submission.operationId, 'operationId');
    const resource = this.#getResource(submission.resourceId);
    const duplicate = resource.byOperationId.get(submission.operationId);
    if (duplicate) return duplicate;
    if (
      !Number.isInteger(submission.baseRevision) ||
      submission.baseRevision < 0 ||
      submission.baseRevision > resource.accepted.length
    ) {
      throw new CollaborationError(
        CollaborationErrorCode.InvalidRevision,
        `Submission base revision ${submission.baseRevision} is invalid for server revision ${resource.accepted.length}.`,
        {
          resourceId: submission.resourceId,
          baseRevision: submission.baseRevision,
          serverRevision: resource.accepted.length,
        },
      );
    }
    const definition = this.#contributors.require(submission.ownerId, submission.operationType);
    let operations = this.#contributors.operations.decode(
      submission.operationType.id,
      submission.operationType.version,
      submission.payload,
    );
    for (const accepted of resource.accepted.slice(submission.baseRevision)) {
      operations = this.#contributors.operations.transformPair(
        definition,
        operations,
        accepted.definition,
        accepted.operations,
        priorityFor(submission.operationId, accepted.batch.operationId),
      ).left;
    }
    const batch: CollaborationAcceptedBatch = {
      ...submission,
      kind: 'accepted',
      serverRevision: resource.accepted.length + 1,
      payload: this.#contributors.operations.encode(definition, operations),
    };
    resource.accepted.push({ batch, definition, operations });
    resource.byOperationId.set(batch.operationId, batch);
    return batch;
  }

  /** Returns ordered canonical batches after a known revision. */
  public sync(resourceId: string, fromRevision: number): CollaborationSyncMessage {
    assertIdentity(resourceId, 'resourceId');
    const resource = this.#getResource(resourceId);
    if (!Number.isInteger(fromRevision) || fromRevision < 0 || fromRevision > resource.accepted.length) {
      throw new CollaborationError(
        CollaborationErrorCode.InvalidRevision,
        `Sync revision ${fromRevision} is invalid for server revision ${resource.accepted.length}.`,
        { resourceId, fromRevision, serverRevision: resource.accepted.length },
      );
    }
    return {
      kind: 'sync',
      protocolVersion: CollaborationProtocolVersion,
      resourceId,
      fromRevision,
      serverRevision: resource.accepted.length,
      batches: resource.accepted.slice(fromRevision).map(({ batch }) => batch),
    };
  }

  #getResource(resourceId: string): CollaborationResourceLog {
    const resource = this.#resources.get(resourceId) ?? { accepted: [], byOperationId: new Map() };
    this.#resources.set(resourceId, resource);
    return resource;
  }
}

function priorityFor(leftOperationId: string, rightOperationId: string): OTTransformPriority {
  return leftOperationId.localeCompare(rightOperationId) <= 0 ? OTTransformPriority.LEFT : OTTransformPriority.RIGHT;
}

function assertProtocol(version: number): void {
  if (version === CollaborationProtocolVersion) return;
  throw new CollaborationError(
    CollaborationErrorCode.InvalidProtocol,
    `Unsupported collaboration protocol version ${version}.`,
    { protocolVersion: version, supportedProtocolVersion: CollaborationProtocolVersion },
  );
}

function assertIdentity(value: string, field: string): void {
  if (value.trim().length > 0) return;
  throw new CollaborationError(CollaborationErrorCode.InvalidIdentity, `Collaboration ${field} must not be empty.`, {
    field,
  });
}
