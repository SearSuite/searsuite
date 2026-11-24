import { SearError } from '@searsuite/sear-foundation-error';
import { Rect, Point } from '@searsuite/sear-foundation-rect';

import { BaseOT, OTOperation, OTClone } from './BaseOT';
import { isMatrixStructureOperation } from './isMatrixStructureOperation';
import { MatrixOT } from './MatrixOT';
import { MatrixOTActionName } from './MatrixOTActionName';
import { type MatrixOTOperationPath } from './MatrixOTOperationPath';
import { type MatrixStructureOTOperation } from './MatrixStructureOTOperation';

/** Compact command keys persisted in rectangle OT payloads. */
export enum RectOTActionName {
  UpdateRect = 'ur',
}

/** Replaces a rectangle's two corner points. */
export interface UpdateRectOTOperation extends OTOperation {
  /** Target rectangle path or matrix coordinate path. */
  p: MatrixOTOperationPath;
  /** New rectangle range as [startPoint, endPoint]. */
  [RectOTActionName.UpdateRect]: [Point, Point];
}

/** Creates a semantic rectangle update without changing the RectOT wire shape. */
export function createUpdateRectOTOperation(
  path: readonly number[],
  start: readonly [number, number],
  end: readonly [number, number],
): UpdateRectOTOperation {
  return {
    p: [...path],
    [RectOTActionName.UpdateRect]: [[...start], [...end]],
  };
}

/** Operations that can update a rectangle directly or shift it through matrix structure edits. */
type RectOTOperation = MatrixStructureOTOperation<unknown> | UpdateRectOTOperation;

/**
 * Operational Transformation implementation for sheet rectangle state.
 *
 * RectOT applies direct rectangle updates and matrix structure operations that
 * shift row/column coordinates inside the rectangle.
 */
export class RectOT extends BaseOT {
  /** Creates a RectOT descriptor for diagnostics and shared OT registries. */
  constructor() {
    super('RectOT');
  }

  /**
   * Builds the inverse of one rectangle operation.
   * @param currentOperation - Operation to invert.
   * @param beforeRect - Rectangle state before the forward update operation.
   * @returns An operation that restores the previous rectangle state.
   */
  public static invertComponent(currentOperation: RectOTOperation, beforeRect?: Rect): RectOTOperation {
    const path = [...currentOperation.p];

    if (RectOTActionName.UpdateRect in currentOperation && currentOperation.ur !== void 0) {
      if (beforeRect === void 0) {
        throw new SearError('RectOT update rect inverse requires previous rect state');
      }
      const [[startRow, startCol], [endRow, endCol]] = beforeRect.shape;
      return {
        p: path,
        [RectOTActionName.UpdateRect]: [
          [startRow, startCol],
          [endRow, endCol],
        ],
      };
    }
    if (isMatrixStructureOperation(currentOperation)) {
      return MatrixOT.invertComponent(currentOperation) as RectOTOperation;
    }

    throw new SearError('invalid / missing instruction in op');
  }

  /**
   * Inverts a rectangle operation list using the rectangle state before each component.
   * @param operations - Forward operations to invert.
   * @param beforeRect - Rectangle state before any forward operations are applied.
   * @returns Operations that undo the input when applied in order.
   */
  public static invert(operations: RectOTOperation[], beforeRect: Rect): RectOTOperation[] {
    RectOT.checkValidOp(operations);

    const currentRect = beforeRect.clone();
    const inverseOperations: RectOTOperation[] = [];
    for (const operation of operations) {
      inverseOperations.push(RectOT.invertComponent(operation, currentRect.clone()));
      RectOT.apply(currentRect, [operation]);
    }
    return inverseOperations.reverse();
  }

  /**
   * Applies rectangle operations to a mutable Rect snapshot.
   * @param snapshot - Rectangle to mutate.
   * @param operations - Operations to apply in order.
   * @returns The same rectangle after mutation.
   */
  public static apply<U>(snapshot: Rect, operations: RectOTOperation[]) {
    RectOT.checkValidOp(operations);

    operations = OTClone(operations);

    for (let i = 0; i < operations.length; i++) {
      const currentOperation = operations[i];

      if (MatrixOTActionName.RowInsert in currentOperation && currentOperation.ri !== void 0) {
        snapshot.addRow(currentOperation.p[0]);
        // snapshot.addRow(currentOperation.p[0], currentOperation.ri);
      } else if (MatrixOTActionName.RowDelete in currentOperation && currentOperation.rd !== void 0) {
        snapshot.removeRow(currentOperation.p[0]);
      } else if (MatrixOTActionName.RowMove in currentOperation && currentOperation.rm !== void 0) {
        RectOT.#swapAxis(snapshot, 0, currentOperation.p[0], currentOperation[MatrixOTActionName.RowMove][0]);
      } else if (MatrixOTActionName.ColInsert in currentOperation && currentOperation.ci !== void 0) {
        snapshot.addCol(currentOperation.p[0]);
      } else if (MatrixOTActionName.ColDelete in currentOperation && currentOperation.cd !== void 0) {
        snapshot.removeCol(currentOperation.p[0]);
      } else if (MatrixOTActionName.ColMove in currentOperation && currentOperation.cm !== void 0) {
        RectOT.#swapAxis(snapshot, 1, currentOperation.p[0], currentOperation.cm[0]);
      } else if (RectOTActionName.UpdateRect in currentOperation && currentOperation.ur !== void 0) {
        snapshot.update(currentOperation.ur);
      } else {
        throw new SearError('invalid / missing instruction in op');
      }
    }
    return snapshot;
  }

  /**
   * Swaps one rectangle axis when a row or column move swaps two positions.
   * @param snapshot - Rectangle to update in place.
   * @param axis - Axis to shift: 0 for rows, 1 for columns.
   * @param firstIndex - First moved index.
   * @param secondIndex - Second moved index.
   */
  static #swapAxis(snapshot: Rect, axis: 0 | 1, firstIndex: number, secondIndex: number): void {
    const firstPoint = snapshot.getPoint(0);
    const secondPoint = snapshot.getPoint(1);
    const shifted = [firstPoint[axis], secondPoint[axis]].map((value) => {
      if (value === firstIndex) return secondIndex;
      if (value === secondIndex) return firstIndex;
      return value;
    });
    firstPoint[axis] = Math.min(...shifted);
    secondPoint[axis] = Math.max(...shifted);
  }
}
