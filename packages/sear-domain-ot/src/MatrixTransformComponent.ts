import { type OTTransformPriority } from './BaseOT';
import { type MatrixOTOperation } from './MatrixOTOperation';

/** Transforms one matrix component against one concurrent component. */
export type MatrixTransformComponent<T> = (
  destination: MatrixOTOperation<T>[],
  operation: MatrixOTOperation<T>,
  otherOperation: MatrixOTOperation<T>,
  type: OTTransformPriority,
) => MatrixOTOperation<T>[];
