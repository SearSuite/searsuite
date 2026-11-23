import { BaseOT, OTClone } from './BaseOT';
import { appendMatrixOperation } from './appendMatrixOperation';
import { type MatrixOTOperation } from './MatrixOTOperation';

/** Composes two sequential matrix operation lists. */
export function composeMatrixOperations<T>(
  first: MatrixOTOperation<T>[],
  second: MatrixOTOperation<T>[],
): MatrixOTOperation<T>[] {
  BaseOT.checkValidOp(first);
  BaseOT.checkValidOp(second);
  const result = OTClone(first) as MatrixOTOperation<T>[];
  for (const operation of second) appendMatrixOperation(result, operation);
  return result;
}
