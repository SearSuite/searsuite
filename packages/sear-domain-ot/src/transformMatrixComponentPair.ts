import { OTTransformPriority } from './BaseOT';
import { type MatrixOTOperation } from './MatrixOTOperation';
import { type MatrixTransformComponent } from './MatrixTransformComponent';

/** Rebases two concurrent matrix components against each other. */
export function transformMatrixComponentPair<T>(
  left: MatrixOTOperation<T>,
  right: MatrixOTOperation<T>,
  destinationLeft: MatrixOTOperation<T>[],
  destinationRight: MatrixOTOperation<T>[],
  transformComponent: MatrixTransformComponent<T>,
): void {
  transformComponent(destinationLeft, left, right, OTTransformPriority.LEFT);
  transformComponent(destinationRight, right, left, OTTransformPriority.RIGHT);
}
