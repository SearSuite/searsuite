import { OTClone, OTTransformPriority, type OTOperation } from './BaseOT';
import { TransactionOTError, TransactionOTErrorCode } from './TransactionOTError';
import {
  transactionOTTypeKey,
  type OTEncodedValue,
  type OTTransformPair,
  type OTTransformRelation,
  type TransactionOTDefinition,
} from './TransactionOTTypes';

interface RegisteredDefinition {
  readonly definition: TransactionOTDefinition;
  references: number;
}

interface RegisteredRelation {
  readonly relation: OTTransformRelation;
  readonly key: string;
  references: number;
  readonly disposeDefinitions: readonly [() => void, () => void];
}

/** Local registry of versioned OT families and explicit pair transformations. */
export class TransactionOTRegistry {
  private readonly definitions = new Map<string, RegisteredDefinition>();
  private readonly relations = new Map<string, RegisteredRelation>();
  private destroyed = false;

  /** Registers one operation family and returns an idempotent disposer. */
  public registerType<OperationType extends OTOperation>(
    definition: TransactionOTDefinition<OperationType>,
  ): () => void {
    this.assertLive();
    assertDefinition(definition);
    const key = transactionOTTypeKey(definition);
    const existing = this.definitions.get(key);
    if (existing && existing.definition !== definition) {
      throw new TransactionOTError(
        TransactionOTErrorCode.TypeConflict,
        `Transaction OT type "${key}" is already registered.`,
        { operationType: key },
      );
    }
    Object.freeze(definition);
    const registration = existing ?? {
      definition: definition as TransactionOTDefinition,
      references: 0,
    };
    registration.references += 1;
    this.definitions.set(key, registration);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      const current = this.definitions.get(key);
      if (current !== registration) return;
      current.references -= 1;
      if (current.references === 0) this.definitions.delete(key);
    };
  }

  /** Registers one explicit relation. Reverse lookup uses the same implementation with swapped branches. */
  public registerRelation<Left extends OTOperation, Right extends OTOperation>(
    relation: OTTransformRelation<Left, Right>,
  ): () => void {
    this.assertLive();
    const key = relationKey(relation.left, relation.right);
    const existing = this.relations.get(key);
    if (existing && existing.relation !== relation) {
      throw new TransactionOTError(
        TransactionOTErrorCode.RelationConflict,
        `Transaction OT relation "${key}" is already registered.`,
        { relation: key },
      );
    }
    Object.freeze(relation);
    const registration = existing ?? {
      relation: relation as OTTransformRelation,
      key,
      references: 0,
      disposeDefinitions: [this.registerType(relation.left), this.registerType(relation.right)] as const,
    };
    registration.references += 1;
    this.relations.set(key, registration);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      const current = this.relations.get(key);
      if (current !== registration) return;
      current.references -= 1;
      if (current.references > 0) return;
      this.relations.delete(key);
      [...current.disposeDefinitions].reverse().forEach((dispose) => dispose());
    };
  }

  /** Registers two families as independent, so pair transformation is explicit identity. */
  public registerIndependent(left: TransactionOTDefinition, right: TransactionOTDefinition): () => void {
    const relation: OTTransformRelation = {
      left,
      right,
      transformPair(leftOperations, rightOperations) {
        return { left: OTClone([...leftOperations]), right: OTClone([...rightOperations]) };
      },
    };
    return this.registerRelation(relation);
  }

  /** Resolves a registered operation family. */
  public requireType(id: string, version: number): TransactionOTDefinition {
    this.assertLive();
    const key = transactionOTTypeKey({ id, version });
    const registration = this.definitions.get(key);
    if (!registration) {
      throw new TransactionOTError(
        TransactionOTErrorCode.TypeNotRegistered,
        `Transaction OT type "${key}" is not registered.`,
        { operationType: key },
      );
    }
    return registration.definition;
  }

  /** Encodes and validates one operation family payload. */
  public encode<OperationType extends OTOperation>(
    definition: TransactionOTDefinition<OperationType>,
    operations: readonly OperationType[],
  ): OTEncodedValue {
    this.assertOperations(definition, operations);
    return definition.encode(operations);
  }

  /** Decodes a wire payload through its registered family definition. */
  public decode(id: string, version: number, payload: unknown): OTOperation[] {
    const definition = this.requireType(id, version);
    const operations = definition.decode(payload);
    this.assertOperations(definition, operations);
    return operations;
  }

  /** Inverts operations through their family definition. */
  public invert<OperationType extends OTOperation>(
    definition: TransactionOTDefinition<OperationType>,
    operations: readonly OperationType[],
  ): OperationType[] {
    this.assertOperations(definition, operations);
    if (!definition.invert) {
      throw new TransactionOTError(
        TransactionOTErrorCode.InvertUnsupported,
        `Transaction OT type "${transactionOTTypeKey(definition)}" does not support inversion.`,
        { operationType: transactionOTTypeKey(definition) },
      );
    }
    return definition.invert(operations);
  }

  /** Rebases two concurrent operation lists through their registered relation. */
  public transformPair<Left extends OTOperation, Right extends OTOperation>(
    leftDefinition: TransactionOTDefinition<Left>,
    leftOperations: readonly Left[],
    rightDefinition: TransactionOTDefinition<Right>,
    rightOperations: readonly Right[],
    priority: OTTransformPriority,
  ): OTTransformPair<Left, Right> {
    this.assertLive();
    this.assertOperations(leftDefinition, leftOperations);
    this.assertOperations(rightDefinition, rightOperations);
    const direct = this.relations.get(relationKey(leftDefinition, rightDefinition));
    if (direct)
      return direct.relation.transformPair(leftOperations, rightOperations, priority) as OTTransformPair<Left, Right>;
    const reverse = this.relations.get(relationKey(rightDefinition, leftDefinition));
    if (reverse) {
      const reversePriority =
        priority === OTTransformPriority.LEFT ? OTTransformPriority.RIGHT : OTTransformPriority.LEFT;
      const transformed = reverse.relation.transformPair(rightOperations, leftOperations, reversePriority);
      return { left: transformed.right as Left[], right: transformed.left as Right[] };
    }
    const key = relationKey(leftDefinition, rightDefinition);
    throw new TransactionOTError(
      TransactionOTErrorCode.RelationNotRegistered,
      `Transaction OT relation "${key}" is not registered.`,
      { relation: key },
    );
  }

  /** Permanently clears the registry. */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.relations.clear();
    this.definitions.clear();
  }

  private assertOperations(definition: TransactionOTDefinition, operations: readonly OTOperation[]): void {
    if (operations.every((operation) => definition.isOperation(operation))) return;
    throw new TransactionOTError(
      TransactionOTErrorCode.InvalidPayload,
      `Operations do not satisfy transaction OT type "${transactionOTTypeKey(definition)}".`,
      { operationType: transactionOTTypeKey(definition) },
    );
  }

  private assertLive(): void {
    if (!this.destroyed) return;
    throw new TransactionOTError(
      TransactionOTErrorCode.RegistryDestroyed,
      'Transaction OT registry has been destroyed.',
    );
  }
}

function relationKey(left: TransactionOTDefinition, right: TransactionOTDefinition): string {
  return `${transactionOTTypeKey(left)}<->${transactionOTTypeKey(right)}`;
}

function assertDefinition(definition: TransactionOTDefinition): void {
  if (definition.id.trim().length > 0 && Number.isInteger(definition.version) && definition.version > 0) return;
  throw new TransactionOTError(
    TransactionOTErrorCode.InvalidDefinition,
    'Transaction OT definitions require a non-empty id and positive integer version.',
    { operationTypeId: definition.id, operationTypeVersion: definition.version },
  );
}
