import {
  transactionOTTypeKey,
  type OTOperation,
  type OTTransformRelation,
  type TransactionOTDefinition,
  type TransactionOTRegistry,
} from '@searsuite/sear-domain-ot';
import { CollaborationError, CollaborationErrorCode } from './CollaborationError';
import { type CollaborationOperationType } from './CollaborationProtocol';

interface CollaborationContributor {
  readonly ownerId: string;
  readonly definition: TransactionOTDefinition;
  readonly registrations: Set<readonly (() => void)[]>;
}

/** Open collaboration contribution shared by editor clients and authorities. */
export interface CollaborationContribution<OperationType extends OTOperation = OTOperation> {
  readonly ownerId: string;
  readonly definition: TransactionOTDefinition<OperationType>;
  readonly relations?: readonly OTTransformRelation[];
}

/** Owner-to-OT mapping used by clients, authorities, and editor bridges. */
export class CollaborationContributorRegistry {
  private readonly contributors = new Map<string, CollaborationContributor>();
  private destroyed = false;

  public constructor(public readonly operations: TransactionOTRegistry) {}

  /** Registers one collaborative state owner and returns an idempotent disposer. */
  public register<OperationType extends OTOperation>(
    ownerId: string,
    definition: TransactionOTDefinition<OperationType>,
    relations: readonly OTTransformRelation[] = [],
  ): () => void {
    this.assertLive();
    if (ownerId.trim().length === 0) {
      throw new CollaborationError(
        CollaborationErrorCode.InvalidIdentity,
        'Collaborative owners require a non-empty id.',
        { ownerId },
      );
    }
    const algebraDisposers = [
      this.operations.registerType(definition),
      ...relations.map((relation) => this.operations.registerRelation(relation)),
    ];
    const existing = this.contributors.get(ownerId);
    if (existing && existing.definition !== definition) {
      [...algebraDisposers].reverse().forEach((dispose) => dispose());
      throw new CollaborationError(
        CollaborationErrorCode.OwnerConflict,
        `Collaborative owner "${ownerId}" is already registered.`,
        { ownerId },
      );
    }
    const contributor = existing ?? {
      ownerId,
      definition: definition as TransactionOTDefinition,
      registrations: new Set<readonly (() => void)[]>(),
    };
    contributor.registrations.add(algebraDisposers);
    this.contributors.set(ownerId, contributor);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      contributor.registrations.delete(algebraDisposers);
      [...algebraDisposers].reverse().forEach((dispose) => dispose());
      if (contributor.registrations.size === 0 && this.contributors.get(ownerId) === contributor) {
        this.contributors.delete(ownerId);
      }
    };
  }

  /** Resolves one registered owner and optionally validates its wire operation type. */
  public require(ownerId: string, operationType?: CollaborationOperationType): TransactionOTDefinition {
    this.assertLive();
    const contributor = this.contributors.get(ownerId);
    if (!contributor) {
      throw new CollaborationError(
        CollaborationErrorCode.OwnerNotRegistered,
        `Collaborative owner "${ownerId}" is not registered.`,
        { ownerId },
      );
    }
    if (operationType && transactionOTTypeKey(contributor.definition) !== transactionOTTypeKey(operationType)) {
      throw new CollaborationError(
        CollaborationErrorCode.OwnerTypeMismatch,
        `Collaborative owner "${ownerId}" does not use operation type "${transactionOTTypeKey(operationType)}".`,
        {
          ownerId,
          expectedOperationType: transactionOTTypeKey(contributor.definition),
          receivedOperationType: transactionOTTypeKey(operationType),
        },
      );
    }
    return contributor.definition;
  }

  public has(ownerId: string): boolean {
    this.assertLive();
    return this.contributors.has(ownerId);
  }

  public getRegisteredOwnerIds(): readonly string[] {
    this.assertLive();
    return [...this.contributors.keys()].sort();
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.contributors.forEach((contributor) => {
      contributor.registrations.forEach((disposers) => [...disposers].reverse().forEach((dispose) => dispose()));
      contributor.registrations.clear();
    });
    this.contributors.clear();
  }

  private assertLive(): void {
    if (!this.destroyed) return;
    throw new CollaborationError(
      CollaborationErrorCode.RegistryDestroyed,
      'Collaboration contributor registry has been destroyed.',
    );
  }
}
