import { type MatrixOTOperation } from './MatrixOTOperation';

/** Transforms two operation lists and returns the rebased pair. */
export type MatrixTransformSequence<T> = (
  operation: MatrixOTOperation<T>[],
  otherOperation: MatrixOTOperation<T>[],
) => MatrixOTOperation<T>[][];
