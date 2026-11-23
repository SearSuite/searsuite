import { BaseOT, OTTransformPriority, OTClone } from './BaseOT';
import { DenseMatrixOTSnapshot } from './DenseMatrixOTSnapshot';
import { appendMatrixOperation } from './appendMatrixOperation';
import { applyMatrixOperations } from './applyMatrixOperations';
import { composeMatrixOperations } from './composeMatrixOperations';
import { invertMatrixComponent } from './invertMatrixComponent';
import { MatrixOTActionName } from './MatrixOTActionName';
import { type MatrixOTOperation } from './MatrixOTOperation';
import { type MatrixOTSnapshot } from './MatrixOTSnapshot';
import { transformMatrixComponentPair } from './transformMatrixComponentPair';
import { transformMatrixOperations } from './transformMatrixOperations';
import { transformMatrixSequence } from './transformMatrixSequence';
import { transformMatrixSwap } from './transformMatrixSwap';

/**
 * Operational Transformation implementation for CSRMatrix-backed sheet state.
 *
 * MatrixOT owns cell updates, row/column structure edits, dimension resize
 * operations, and the transform rules that keep concurrent matrix changes
 * convergent.
 */
export class MatrixOT extends BaseOT {
  /** Creates a MatrixOT descriptor for diagnostics and shared OT registries. */
  constructor() {
    super('MatrixOT');
  }

  /**
   * Builds the inverse of one matrix component.
   * @param currentOperation - Component to invert.
   * @returns A component that restores the previous matrix state.
   */
  public static invertComponent<U>(currentOperation: MatrixOTOperation<U>): MatrixOTOperation<U> {
    return invertMatrixComponent(currentOperation);
  }

  /**
   * Inverts an operation list in rollback order.
   * @param operations - Forward operations to invert.
   * @returns Operations that undo the input when applied in order.
   */
  public static invert<U>(operations: MatrixOTOperation<U>[]): MatrixOTOperation<U>[] {
    MatrixOT.checkValidOp(operations);
    return operations
      .slice()
      .reverse()
      .map((operation) => MatrixOT.invertComponent<U>(operation));
  }

  /**
   * Applies operations to a CSR matrix snapshot.
   * @param snapshot - Mutable CSR-backed state.
   * @param operations - Matrix operations to apply.
   * @returns The same snapshot instance after mutation.
   */
  public static apply<U, S extends MatrixOTSnapshot<U>>(snapshot: S, operations: MatrixOTOperation<U>[]) {
    return applyMatrixOperations(snapshot, operations);
  }

  /**
   * Appends one component into a composed matrix operation list.
   * @param destination - Composition destination mutated in place.
   * @param current - Operation to append.
   */
  public static append<U>(destination: MatrixOTOperation<U>[], current: MatrixOTOperation<U>) {
    appendMatrixOperation(destination, current);
  }

  /**
   * Composes two sequential matrix operation lists.
   * @param operation1 - Earlier operation list.
   * @param operation2 - Later operation list.
   * @returns Equivalent composed operation list.
   */
  public static compose<U>(operation1: MatrixOTOperation<U>[], operation2: MatrixOTOperation<U>[]) {
    return composeMatrixOperations(operation1, operation2);
  }

  // public static pathMatches<U>(path1: MatrixOTOperationPath, path2: MatrixOTOperationPath): boolean {
  //     if (path1.length != path2.length) return false;

  //     for (let i = 0; i < path1.length; i++) {
  //         if (path1[i] !== path2[i]) return false;
  //     }

  //     return true;
  // }

  /**
   * Computes the common parent depth used by component transformation.
   * @param operation1 - First operation whose parent path is compared.
   * @param operation2 - Second operation whose parent path is compared.
   * @returns The depth of the shared parent segment.
   */
  public static commonLengthForOps<U>(operation1: MatrixOTOperation<U>, operation2: MatrixOTOperation<U>) {
    let operation1Len = operation1.p.length;
    let operation2Len = operation2.p.length;

    // if (operation1Len === 0) return -1;
    // if (operation2Len === 0) return null;

    operation1Len--;
    operation2Len--;

    for (let i = 0; i < operation1Len; i++) {
      const p = operation1.p[i];
      // if (i >= operation2Len || p !== operation2.p[i]) return null;
    }

    return operation1Len;
  }

  /**
   * Transforms one matrix component over one concurrent component.
   * @param destination - Output list receiving the transformed component or no-op.
   * @param currentOperation - Operation being rebased.
   * @param otherOperation - Concurrent operation already applied on the target branch.
   * @param type - Tie-break side for equal-position edits.
   * @returns The destination list after appending any transformed component.
   */
  public static transformComponent<U>(
    destination: MatrixOTOperation<U>[],
    currentOperation: MatrixOTOperation<U>,
    otherOperation: MatrixOTOperation<U>,
    type: OTTransformPriority,
  ) {
    currentOperation = OTClone(currentOperation);
    const swapped = transformMatrixSwap(currentOperation, otherOperation, type);
    if (swapped !== null) {
      swapped.forEach((operation) => MatrixOT.append(destination, operation));
      return destination;
    }

    const common = MatrixOT.commonLengthForOps<U>(otherOperation, currentOperation);
    const commonReverse = MatrixOT.commonLengthForOps<U>(currentOperation, otherOperation);
    let currentOperationPathLength = currentOperation.p.length;
    let otherOperationPathLength = otherOperation.p.length;

    // if c is deleting something, and that thing is changed by otherC, we need to update c to reflect that change for invertibility.
    if (
      commonReverse !== null &&
      otherOperationPathLength > currentOperationPathLength &&
      currentOperation.p[commonReverse] == otherOperation.p[commonReverse]
    ) {
      if (MatrixOTActionName.RowDelete in currentOperation && currentOperation.rd !== void 0) {
        const oc = OTClone(otherOperation);
        oc.p = oc.p.slice(currentOperationPathLength);
        // insert 0 to operation matrix, for it two-dimensional
        oc.p.unshift(0);
        let matrix = new DenseMatrixOTSnapshot<U>().fromDense([currentOperation.rd]);
        matrix = MatrixOT.apply(matrix, [oc]);
        currentOperation.rd = matrix.toArray()[0];
      }
      if (MatrixOTActionName.ColDelete in currentOperation && currentOperation.cd !== void 0) {
        const oc = OTClone(otherOperation);
        oc.p = oc.p.slice(currentOperationPathLength);
        // insert 0 to operation matrix, for it two-dimensional
        oc.p.unshift(0);
        let matrix = new DenseMatrixOTSnapshot<U>().fromDense([currentOperation.cd]);
        matrix = MatrixOT.apply(matrix, [oc]);
        currentOperation.cd = matrix.toArray()[0];
      }
    }

    if (common != null) {
      const commonOperand = currentOperationPathLength == otherOperationPathLength;
      if (MatrixOTActionName.RowInsert in otherOperation && otherOperation.ri !== void 0) {
        if (
          MatrixOTActionName.RowInsert in currentOperation &&
          currentOperation.ri !== void 0 &&
          commonOperand &&
          currentOperation.p[common] === otherOperation.p[common]
        ) {
          if (type === OTTransformPriority.RIGHT) {
            currentOperation.p[common]++;
          }
        } else if (otherOperation.p[common] <= currentOperation.p[common]) {
          currentOperation.p[common]++;
        }

        if (MatrixOTActionName.RowMove in currentOperation && currentOperation.rm !== void 0) {
          if (commonOperand) {
            // otherC edits the same list we edit
            if (otherOperation.p[common] <= currentOperation.rm[0]) currentOperation.rm[0]++;
          }
        }
      } else if (MatrixOTActionName.RowDelete in otherOperation && otherOperation.rd !== void 0) {
        if (MatrixOTActionName.RowMove in currentOperation && currentOperation.rm !== void 0) {
          if (commonOperand) {
            if (otherOperation.p[common] === currentOperation.p[common]) {
              // they deleted the thing we're trying to move
              return destination;
            }
            // otherC edits the same list we edit
            var p = otherOperation.p[common];
            var from = currentOperation.p[common];
            var to = currentOperation.rm[0];
            if (p < to || (p === to && from < to)) currentOperation.rm[0]--;
          }
        }

        // Handle RowDelete operation
        if (
          MatrixOTActionName.UpdateCell in currentOperation &&
          currentOperation.uc !== void 0 &&
          // commonOperand &&
          currentOperation.p[common] === otherOperation.p[common]
        ) {
          // If the current operation is an UpdateCell on a deleted row, make it a no-op
          return destination; // No-op, do not append the current operation
        } else if (
          MatrixOTActionName.RowDelete in currentOperation &&
          currentOperation.rd !== void 0 &&
          commonOperand &&
          currentOperation.p[common] === otherOperation.p[common]
        ) {
          // trying to delete the same element, -> noop
          return destination;
        } else if (otherOperation.p[common] < currentOperation.p[common]) {
          currentOperation.p[common]--;
        }
      } else if (MatrixOTActionName.RowMove in otherOperation && otherOperation.rm !== void 0) {
        if (
          MatrixOTActionName.RowMove in currentOperation &&
          currentOperation.rm !== void 0 &&
          currentOperationPathLength === otherOperationPathLength
        ) {
          // rm vs rm
          var from = currentOperation.p[common];
          var to = currentOperation.rm[0];
          var otherFrom = otherOperation.p[common];
          var otherTo = otherOperation.rm[0];
          if (otherFrom !== otherTo) {
            // if otherFrom == otherTo, we don't need to change our op.

            // where did my thing go?
            if (from === otherFrom) {
              // they moved it! tie break.
              if (type === 'left') {
                currentOperation.p[common] = otherTo;
                // if (from === to) currentOperation.rm[0] = otherTo;
              }
            } else {
              // they moved around it
              if (from > otherFrom) currentOperation.p[common]--;
              if (from > otherTo) currentOperation.p[common]++;
              else if (from === otherTo) {
                if (otherFrom > otherTo) {
                  currentOperation.p[common]++;
                  // if (from === to) currentOperation.rm[0]++;
                }
              }

              // step 2: where am i going to put it?
              if (to > otherFrom) {
                currentOperation.rm[0]--;
              } else if (to === otherFrom) {
                if (to > from) currentOperation.rm[0]--;
              }
              if (to > otherTo) {
                currentOperation.rm[0]++;
              } else if (to === otherTo) {
                // if we're both moving in the same direction, tie break
                if ((otherTo > otherFrom && to > from) || (otherTo < otherFrom && to < from)) {
                  if (type === OTTransformPriority.RIGHT) currentOperation.rm[0]++;
                } else {
                  if (to > from) currentOperation.rm[0]++;
                  // else if (to === otherFrom) currentOperation.rm[0]--;
                }
              }
            }
          }
        } else if (
          MatrixOTActionName.RowInsert in currentOperation &&
          currentOperation.ri !== void 0 &&
          commonOperand
        ) {
          // ri
          const from = otherOperation.p[common];
          const to = otherOperation.rm[0];
          const p = currentOperation.p[common];
          if (p > from) currentOperation.p[common]--;
          if (p > to) currentOperation.p[common]++;
        } else {
          // rd, rd+ri, uc on an element beneath
          const from = otherOperation.p[common];
          const to = otherOperation.rm[0];
          const p = currentOperation.p[common];
          if (p === from) {
            currentOperation.p[common] = to;
          }
          // else {
          // if (p > from) currentOperation.p[common]--;
          // if (p > to) currentOperation.p[common]++;
          // else if (p === to && from > to) currentOperation.p[common]++;
          // }
        }
      } else if (MatrixOTActionName.ColInsert in otherOperation && otherOperation.ci !== void 0) {
        // ci vs ci
        if (
          MatrixOTActionName.ColInsert in currentOperation &&
          currentOperation.ci !== void 0 &&
          commonOperand &&
          currentOperation.p[common] === otherOperation.p[common]
        ) {
          if (type === OTTransformPriority.RIGHT) {
            currentOperation.p[common]++;
          }
        }
        // ci vs uc
        else if (
          MatrixOTActionName.UpdateCell in currentOperation &&
          currentOperation.uc !== void 0
          // && commonOperand &&
          // currentOperation.p[common] === otherOperation.p[common]
        ) {
          if (otherOperation.p[common] <= currentOperation.p[common + 1]) {
            currentOperation.p[1]++;
          }
        }
        // ci vs cd
        else if (
          MatrixOTActionName.ColDelete in currentOperation &&
          currentOperation.cd !== void 0 &&
          commonOperand &&
          currentOperation.p[common] === otherOperation.p[common]
        ) {
          currentOperation.p[common]++;
        } else if (MatrixOTActionName.ColMove in currentOperation && currentOperation.cm !== void 0 && commonOperand) {
          currentOperation.p[common] += Number(otherOperation.p[common] <= currentOperation.p[common]);
        }

        if (MatrixOTActionName.ColMove in currentOperation && currentOperation.cm !== void 0) {
          if (commonOperand) {
            // otherC edits the same list we edit
            if (otherOperation.p[common] <= currentOperation.cm[0]) currentOperation.cm[0]++;
          }
        }
      } else if (MatrixOTActionName.ColDelete in otherOperation && otherOperation.cd !== void 0) {
        if (MatrixOTActionName.ColMove in currentOperation && currentOperation.cm !== void 0) {
          if (commonOperand) {
            if (otherOperation.p[common] === currentOperation.p[common]) {
              // they deleted the thing we're trying to move
              return destination;
            }
            // otherC edits the same list we edit
            var p = otherOperation.p[common];
            var from = currentOperation.p[common];
            var to = currentOperation.cm[0];
            if (p < to || (p === to && from < to)) currentOperation.cm[0]--;
          }
        }

        // Handle RowDelete operation
        if (
          MatrixOTActionName.UpdateCell in currentOperation &&
          currentOperation.uc !== void 0
          // commonOperand &&
        ) {
          if (currentOperation.p[1] === otherOperation.p[0]) {
            // If the current operation is an UpdateCell on a deleted row, make it a no-op
            return destination; // No-op, do not append the current operation
          }
          if (otherOperation.p[common] <= currentOperation.p[common + 1]) {
            currentOperation.p[1]--;
          }
        } else if (
          MatrixOTActionName.ColDelete in currentOperation &&
          currentOperation.cd !== void 0 &&
          commonOperand
        ) {
          if (currentOperation.p[common] === otherOperation.p[common]) {
            // trying to delete the same element, -> noop
            return destination;
          }
          // if (otherOperation.p[common] <= currentOperation.p[common]) {
          //     currentOperation.p[common]--;
          // }
        } else if (
          MatrixOTActionName.ColMove in currentOperation &&
          currentOperation.cm !== void 0 &&
          otherOperation.p[common] <= currentOperation.p[common]
        ) {
          currentOperation.p[common]--;
        }
      } else if (MatrixOTActionName.ColMove in otherOperation && otherOperation.cm !== void 0) {
        if (
          MatrixOTActionName.ColMove in currentOperation &&
          currentOperation.cm !== void 0 &&
          currentOperationPathLength === otherOperationPathLength
        ) {
          // rm vs rm
          var from = currentOperation.p[common];
          var to = currentOperation.cm[0];
          var otherFrom = otherOperation.p[common];
          var otherTo = otherOperation.cm[0];
          if (otherFrom !== otherTo) {
            // if otherFrom == otherTo, we don't need to change our op.

            // where did my thing go?
            if (from === otherFrom) {
              // they moved it! tie break.
              if (type === 'left') {
                currentOperation.p[common] = otherTo;
                // if (from === to) currentOperation.cm[0] = otherTo;
              }
            } else {
              // they moved around it
              if (from > otherFrom) currentOperation.p[common]--;
              if (from > otherTo) currentOperation.p[common]++;
              else if (from === otherTo) {
                if (otherFrom > otherTo) {
                  currentOperation.p[common]++;
                  // if (from === to) currentOperation.cm[0]++;
                }
              }

              // step 2: where am i going to put it?
              if (to > otherFrom) {
                currentOperation.cm[0]--;
              } else if (to === otherFrom) {
                if (to > from) currentOperation.cm[0]--;
              }
              if (to > otherTo) {
                currentOperation.cm[0]++;
              } else if (to === otherTo) {
                // if we're both moving in the same direction, tie break
                if ((otherTo > otherFrom && to > from) || (otherTo < otherFrom && to < from)) {
                  if (type === OTTransformPriority.RIGHT) currentOperation.cm[0]++;
                } else {
                  if (to > from) currentOperation.cm[0]++;
                  // else if (to === otherFrom) currentOperation.cm[0]--;
                }
              }
            }
          }
        } else if (
          MatrixOTActionName.ColInsert in currentOperation &&
          currentOperation.ci !== void 0 &&
          commonOperand
        ) {
          const from = otherOperation.p[common];
          const to = otherOperation.cm[0];
          const p = currentOperation.p[common];
          if (p > from) currentOperation.p[common]--;
          if (p > to) currentOperation.p[common]++;
        } else {
          // cd, cd+ci, uc on an element beneath
          const from = otherOperation.p[common];
          const to = otherOperation.cm[0];
          const p = currentOperation.p[common];
          if (p === from) {
            currentOperation.p[common] = to;
          }
          // else {
          // if (p > from) currentOperation.p[common]--;
          // if (p > to) currentOperation.p[common]++;
          // else if (p === to && from > to) currentOperation.p[common]++;
          // }
        }
      }
      // else if (MatrixOTActionName.UpdateCell in otherOperation && otherOperation.uc !== void 0) {
      //     // Handle UpdateCell operation
      //     if (
      //         MatrixOTActionName.RowDelete in currentOperation &&
      //         currentOperation.rd !== void 0 &&
      //         commonOperand &&
      //         currentOperation.p[common] === otherOperation.p[common]
      //     ) {
      //         // If the other operation is an UpdateCell on a row that is being deleted, no-op the UpdateCell
      //         return destination; // No-op, do not append the other operation
      //     }
      // }
    }

    MatrixOT.append(destination, currentOperation);
    return destination;
  }

  /** Transforms one Matrix OT component against another concurrent component. */
  public static transformComponentX<U>(
    left: MatrixOTOperation<U>,
    right: MatrixOTOperation<U>,
    destLeft: MatrixOTOperation<U>[],
    destRight: MatrixOTOperation<U>[],
  ) {
    transformMatrixComponentPair(left, right, destLeft, destRight, MatrixOT.transformComponent);
  }

  /** Transforms one Matrix OT operation against a concurrent operation. */
  public static transformX<U>(leftOperation: MatrixOTOperation<U>[], rightOperation: MatrixOTOperation<U>[]) {
    return transformMatrixSequence(leftOperation, rightOperation, MatrixOT.transformComponentX, MatrixOT.append);
  }

  /** Transforms concurrent Matrix OT operations into a convergent pair. */
  public static transform<U>(
    operation: MatrixOTOperation<U>[],
    otherOperation: MatrixOTOperation<U>[],
    type: OTTransformPriority,
  ) {
    return transformMatrixOperations(operation, otherOperation, type, MatrixOT.transformComponent, MatrixOT.transformX);
  }
}
