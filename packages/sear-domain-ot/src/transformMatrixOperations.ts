import { SearError } from '@searsuite/sear-foundation-error';
import { OTTransformPriority } from './BaseOT';
import { type MatrixOTOperation } from './MatrixOTOperation';
import { type MatrixTransformComponent } from './MatrixTransformComponent';
import { type MatrixTransformSequence } from './MatrixTransformSequence';

/** Transforms one matrix operation list against another with an explicit tie-break side. */
export function transformMatrixOperations<T>(
  operation: MatrixOTOperation<T>[],
  otherOperation: MatrixOTOperation<T>[],
  type: OTTransformPriority,
  transformComponent: MatrixTransformComponent<T>,
  transformSequence: MatrixTransformSequence<T>,
): MatrixOTOperation<T>[] {
  if (!(type === OTTransformPriority.LEFT || type === OTTransformPriority.RIGHT))
    throw new SearError(`type must be '${OTTransformPriority.LEFT}' or '${OTTransformPriority.RIGHT}'`);
  if (otherOperation.length === 0) return operation;
  if (operation.length === 1 && otherOperation.length === 1)
    return transformComponent([], operation[0], otherOperation[0], type);
  if (type === OTTransformPriority.LEFT) return transformSequence(operation, otherOperation)[0];
  return transformSequence(otherOperation, operation)[1];
}
