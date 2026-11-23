import { OTClone, OTTransformPriority, type OTOperation } from './BaseOT';
import { MatrixOT } from './MatrixOT';
import { isMatrixOperation } from './isMatrixOperation';
import { type MatrixOTOperation } from './MatrixOTOperation';
import { RichDocOT } from './RichDocOT';
import { RichDocOTActionName, type RichDocOTOperation } from './RichDocOTOperations';
import { TransactionOTError, TransactionOTErrorCode } from './TransactionOTError';
import { TransactionOTRegistry } from './TransactionOTRegistry';
import { type OTEncodedValue, type OTTransformRelation, type TransactionOTDefinition } from './TransactionOTTypes';

/** Built-in MatrixOT family shared by matrix-backed transaction owners. */
export const MatrixTransactionOT: TransactionOTDefinition<MatrixOTOperation<unknown>> = Object.freeze({
  id: 'sear.matrix',
  version: 1,
  isOperation: isMatrixOperation,
  encode: encodeOperations,
  decode(payload: unknown): MatrixOTOperation<unknown>[] {
    return decodeOperations(payload, isMatrixOperation, 'sear.matrix@1');
  },
  invert(operations: readonly MatrixOTOperation<unknown>[]): MatrixOTOperation<unknown>[] {
    return MatrixOT.invert([...operations]);
  },
});

/** Built-in rich-document operation family. */
export const RichDocTransactionOT: TransactionOTDefinition<RichDocOTOperation> = Object.freeze({
  id: 'sear.rich-doc',
  version: 1,
  isOperation: isRichDocOperation,
  encode: encodeOperations,
  decode(payload: unknown): RichDocOTOperation[] {
    return decodeOperations(payload, isRichDocOperation, 'sear.rich-doc@1');
  },
  invert(operations: readonly RichDocOTOperation[]): RichDocOTOperation[] {
    return RichDocOT.invert([...operations]);
  },
});

/** Matrix-to-matrix pair transformation used by every matrix-backed owner. */
export const MatrixTransactionOTRelation: OTTransformRelation<
  MatrixOTOperation<unknown>,
  MatrixOTOperation<unknown>
> = Object.freeze({
  left: MatrixTransactionOT,
  right: MatrixTransactionOT,
  transformPair(
    left: readonly MatrixOTOperation<unknown>[],
    right: readonly MatrixOTOperation<unknown>[],
    priority: OTTransformPriority,
  ) {
    return transformBoth(left, right, priority, MatrixOT.transform);
  },
});

/** Rich-document pair transformation. */
export const RichDocTransactionOTRelation: OTTransformRelation<RichDocOTOperation, RichDocOTOperation> = Object.freeze({
  left: RichDocTransactionOT,
  right: RichDocTransactionOT,
  transformPair(
    left: readonly RichDocOTOperation[],
    right: readonly RichDocOTOperation[],
    priority: OTTransformPriority,
  ) {
    return transformBoth(left, right, priority, RichDocOT.transform);
  },
});

/** Creates an isolated registry containing all built-in OT definitions and relations. */
export function createBuiltinTransactionOTRegistry(): TransactionOTRegistry {
  const registry = new TransactionOTRegistry();
  registry.registerRelation(MatrixTransactionOTRelation);
  registry.registerRelation(RichDocTransactionOTRelation);
  return registry;
}

function transformBoth<OperationType extends OTOperation>(
  left: readonly OperationType[],
  right: readonly OperationType[],
  priority: OTTransformPriority,
  transform: (operations: OperationType[], other: OperationType[], priority: OTTransformPriority) => OperationType[],
): { left: OperationType[]; right: OperationType[] } {
  const opposite = priority === OTTransformPriority.LEFT ? OTTransformPriority.RIGHT : OTTransformPriority.LEFT;
  return {
    left: transform([...left], [...right], priority),
    right: transform([...right], [...left], opposite),
  };
}

function encodeOperations<OperationType extends OTOperation>(operations: readonly OperationType[]): OTEncodedValue {
  return toEncodedValue(OTClone(operations));
}

function toEncodedValue(value: unknown): OTEncodedValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) return value.map(toEncodedValue);
  if (typeof value === 'object') {
    const encoded: Record<string, OTEncodedValue> = {};
    Object.entries(value).forEach(([key, item]) => {
      encoded[key] = toEncodedValue(item);
    });
    return encoded;
  }
  throw new TransactionOTError(TransactionOTErrorCode.InvalidPayload, 'Cannot encode a non-JSON OT value.', {
    valueType: typeof value,
  });
}

function decodeOperations<OperationType extends OTOperation>(
  payload: unknown,
  guard: (operation: OTOperation) => operation is OperationType,
  operationType: string,
): OperationType[] {
  if (!Array.isArray(payload) || !payload.every(isOTOperation) || !payload.every(guard)) {
    throw new TransactionOTError(
      TransactionOTErrorCode.InvalidPayload,
      `Invalid payload for transaction OT type "${operationType}".`,
      { operationType },
    );
  }
  return OTClone(payload);
}

function isOTOperation(value: unknown): value is OTOperation {
  return typeof value === 'object' && value !== null && Array.isArray((value as Partial<OTOperation>).p);
}

function isRichDocOperation(operation: OTOperation): operation is RichDocOTOperation {
  return Object.values(RichDocOTActionName).some((action) => action in operation);
}
