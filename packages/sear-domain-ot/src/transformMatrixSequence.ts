import { BaseOT } from './BaseOT';
import { type MatrixAppendOperation } from './MatrixAppendOperation';
import { type MatrixOTOperation } from './MatrixOTOperation';
import { type MatrixTransformComponentPair } from './MatrixTransformComponentPair';

/** Transforms two matrix operation sequences through pairwise rebasing. */
export function transformMatrixSequence<T>(
  leftOperation: MatrixOTOperation<T>[],
  rightOperation: MatrixOTOperation<T>[],
  transformComponentPair: MatrixTransformComponentPair<T>,
  append: MatrixAppendOperation<T>,
): MatrixOTOperation<T>[][] {
  BaseOT.checkValidOp(leftOperation);
  BaseOT.checkValidOp(rightOperation);
  const newRightOperation: MatrixOTOperation<T>[] = [];
  for (const rightOperationItem of rightOperation) {
    let rightComponent: MatrixOTOperation<T> | null = rightOperationItem;
    const newLeftOperation: MatrixOTOperation<T>[] = [];
    let leftIndex = 0;
    while (leftIndex < leftOperation.length) {
      const nextRightComponents: MatrixOTOperation<T>[] = [];
      transformComponentPair(leftOperation[leftIndex], rightComponent, newLeftOperation, nextRightComponents);
      leftIndex++;
      if (nextRightComponents.length === 0) {
        for (let remainingIndex = leftIndex; remainingIndex < leftOperation.length; remainingIndex++)
          append(newLeftOperation, leftOperation[remainingIndex]);
        rightComponent = null;
        break;
      }
      if (nextRightComponents.length === 1) {
        rightComponent = nextRightComponents[0];
      } else {
        const [remainingLeft, remainingRight] = transformMatrixSequence(
          leftOperation.slice(leftIndex),
          nextRightComponents,
          transformComponentPair,
          append,
        );
        remainingLeft.forEach((operation) => append(newLeftOperation, operation));
        remainingRight.forEach((operation) => append(newRightOperation, operation));
        rightComponent = null;
        break;
      }
    }
    if (rightComponent !== null) append(newRightOperation, rightComponent);
    leftOperation = newLeftOperation;
  }
  return [leftOperation, newRightOperation];
}
