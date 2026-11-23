import { type MatrixOTOperation } from './MatrixOTOperation';

/** Transforms both sides of a concurrent component pair. */
export type MatrixTransformComponentPair<T> = (
  left: MatrixOTOperation<T>,
  right: MatrixOTOperation<T>,
  destinationLeft: MatrixOTOperation<T>[],
  destinationRight: MatrixOTOperation<T>[],
) => void;
