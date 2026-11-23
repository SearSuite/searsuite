import { SearError } from '@searsuite/sear-foundation-error';
import { BaseOT, OTClone, OTOperation, OTTransformPriority } from './BaseOT';
import {
  adjustPathForNodeDelete as adjustRichDocPathForNodeDelete,
  adjustPathForNodeInsert as adjustRichDocPathForNodeInsert,
  haveSameRichDocParent,
  isStrictRichDocPathPrefix,
  resolveRichDocParent,
  transformIndexForMove,
} from './RichDocOTHelpers';
import {
  DeleteNodeOTOperation,
  DeleteStringOTOperation,
  InsertNodeOTOperation,
  InsertStringOTOperation,
  MoveNodeOTOperation,
  NodeSchema,
  RichDocOTActionName,
  RichDocOTOperation,
  RichDocOTOperationPath,
  ReplaceNodeOTOperation,
  UpdateAttrsOTOperation,
} from './RichDocOTOperations';

export * from './RichDocOTOperations';

/**
 * Operational Transformation implementation for the JSON rich-document model.
 *
 * RichDocOT applies node, text, and attribute operations and rebases concurrent
 * edits so document trees converge across collaboration clients.
 */
export class RichDocOT extends BaseOT {
  /** Creates a RichDocOT descriptor for diagnostics and shared OT registries. */
  constructor() {
    super('RichDocOT');
  }

  /**
   * Creates a detached rich-document operation list.
   * @param data - Optional operation list to clone.
   * @returns A mutable operation list owned by the caller.
   */
  public static override create(data?: RichDocOTOperation[]): RichDocOTOperation[] {
    return data === void 0 ? [] : OTClone(data);
  }

  /**
   * Applies rich-document operations to a mutable node snapshot.
   * @param snapshot - Root node to mutate.
   * @param operations - Operations to apply in order.
   * @returns The same snapshot instance after mutation.
   */
  public static apply(snapshot: NodeSchema, operations: RichDocOTOperation[]): NodeSchema {
    RichDocOT.checkValidOp(operations as OTOperation[]);

    operations = OTClone(operations);

    for (const op of operations) {
      const parent = resolveRichDocParent(snapshot, op.p);
      const last = op.p[op.p.length - 1];

      if (isNodeReplaceOperation(op)) {
        const idx = last as number;
        if (!parent.content) parent.content = [];
        (parent.content as NodeSchema[]).splice(idx, 1, (op as ReplaceNodeOTOperation)[RichDocOTActionName.NodeInsert]);
      } else if (RichDocOTActionName.NodeInsert in op) {
        const idx = last as number;
        if (!parent.content) parent.content = [];
        (parent.content as NodeSchema[]).splice(idx, 0, (op as InsertNodeOTOperation)[RichDocOTActionName.NodeInsert]);
      } else if (RichDocOTActionName.NodeDelete in op) {
        const idx = last as number;
        (parent.content as NodeSchema[]).splice(idx, 1);
      } else if (RichDocOTActionName.NodeMove in op) {
        const from = last as number;
        const to = (op as MoveNodeOTOperation)[RichDocOTActionName.NodeMove][0];
        const content = parent.content as NodeSchema[];
        const [node] = content.splice(from, 1);
        content.splice(to, 0, node);
      } else if (RichDocOTActionName.StringInsert in op) {
        const offset = last as number;
        const str = (op as InsertStringOTOperation)[RichDocOTActionName.StringInsert];
        const text = parent.text ?? '';
        parent.text = text.slice(0, offset) + str + text.slice(offset);
      } else if (RichDocOTActionName.StringDelete in op) {
        const offset = last as number;
        const str = (op as DeleteStringOTOperation)[RichDocOTActionName.StringDelete];
        const text = parent.text ?? '';
        const actual = text.slice(offset, offset + str.length);
        if (actual !== str) throw new SearError(`StringDelete mismatch: expected "${str}", got "${actual}"`);
        parent.text = text.slice(0, offset) + text.slice(offset + str.length);
      } else if (RichDocOTActionName.UpdateAttrs in op) {
        const key = last as string;
        if (!parent.attrs) parent.attrs = {};
        const value = (op as UpdateAttrsOTOperation)[RichDocOTActionName.UpdateAttrs].value;
        if (value === void 0) delete parent.attrs[key];
        else parent.attrs[key] = value;
      } else {
        throw new SearError('invalid / missing instruction in op');
      }
    }

    return snapshot;
  }

  /** Creates the inverse operation list for a committed rich-document change. */
  public static invert(operations: RichDocOTOperation[]): RichDocOTOperation[] {
    RichDocOT.checkValidOp(operations as OTOperation[]);
    return operations
      .slice()
      .reverse()
      .map((operation) => {
        if (isNodeReplaceOperation(operation)) {
          return {
            p: [...operation.p],
            [RichDocOTActionName.NodeDelete]: OTClone(
              (operation as ReplaceNodeOTOperation)[RichDocOTActionName.NodeInsert],
            ),
            [RichDocOTActionName.NodeInsert]: OTClone(
              (operation as ReplaceNodeOTOperation)[RichDocOTActionName.NodeDelete],
            ),
          } as RichDocOTOperation;
        }
        if (RichDocOTActionName.NodeInsert in operation) {
          return {
            p: [...operation.p],
            [RichDocOTActionName.NodeDelete]: OTClone(
              (operation as InsertNodeOTOperation)[RichDocOTActionName.NodeInsert],
            ),
          } as RichDocOTOperation;
        }
        if (RichDocOTActionName.NodeDelete in operation) {
          return {
            p: [...operation.p],
            [RichDocOTActionName.NodeInsert]: OTClone(
              (operation as DeleteNodeOTOperation)[RichDocOTActionName.NodeDelete],
            ),
          } as RichDocOTOperation;
        }
        if (RichDocOTActionName.NodeMove in operation) {
          const move = operation as MoveNodeOTOperation;
          const from = move.p[move.p.length - 1];
          const to = move[RichDocOTActionName.NodeMove][0];
          return {
            p: [...move.p.slice(0, -1), to],
            [RichDocOTActionName.NodeMove]: [from],
          } as RichDocOTOperation;
        }
        if (RichDocOTActionName.StringInsert in operation) {
          return {
            p: [...operation.p],
            [RichDocOTActionName.StringDelete]: (operation as InsertStringOTOperation)[
              RichDocOTActionName.StringInsert
            ],
          } as RichDocOTOperation;
        }
        if (RichDocOTActionName.StringDelete in operation) {
          return {
            p: [...operation.p],
            [RichDocOTActionName.StringInsert]: (operation as DeleteStringOTOperation)[
              RichDocOTActionName.StringDelete
            ],
          } as RichDocOTOperation;
        }
        const attrs = operation as UpdateAttrsOTOperation;
        return {
          p: [...attrs.p],
          [RichDocOTActionName.UpdateAttrs]: {
            value: cloneOptional(attrs[RichDocOTActionName.UpdateAttrs].prev),
            prev: cloneOptional(attrs[RichDocOTActionName.UpdateAttrs].value),
          },
        } as RichDocOTOperation;
      });
  }

  /**
   * Appends one rich-document operation into a composed destination list.
   * @param destination - Composition destination mutated in place.
   * @param current - Operation to append.
   */
  public static append(destination: RichDocOTOperation[], current: RichDocOTOperation): void {
    current = OTClone(current);

    if (destination.length === 0) {
      destination.push(current);
      return;
    }

    const last = destination[destination.length - 1];

    // Sequential node replacement keeps the old and new values in one
    // component, matching JSON OT's list replacement semantics.
    if (isNodeReplaceOperation(last) && isNodeReplaceOperation(current) && sameRichDocPath(last.p, current.p)) {
      last[RichDocOTActionName.NodeInsert] = OTClone(current[RichDocOTActionName.NodeInsert]);
      return;
    }
    if (
      RichDocOTActionName.NodeDelete in last &&
      RichDocOTActionName.NodeInsert in current &&
      !isNodeReplaceOperation(last) &&
      !isNodeReplaceOperation(current) &&
      sameRichDocPath(last.p, current.p)
    ) {
      destination[destination.length - 1] = {
        p: [...last.p],
        [RichDocOTActionName.NodeDelete]: OTClone((last as DeleteNodeOTOperation)[RichDocOTActionName.NodeDelete]),
        [RichDocOTActionName.NodeInsert]: OTClone((current as InsertNodeOTOperation)[RichDocOTActionName.NodeInsert]),
      } as RichDocOTOperation;
      return;
    }
    if (
      isNodeReplaceOperation(last) &&
      RichDocOTActionName.NodeDelete in current &&
      !isNodeReplaceOperation(current) &&
      sameRichDocPath(last.p, current.p)
    ) {
      destination[destination.length - 1] = {
        p: [...last.p],
        [RichDocOTActionName.NodeDelete]: OTClone(last[RichDocOTActionName.NodeDelete]),
      } as RichDocOTOperation;
      return;
    }
    if (
      RichDocOTActionName.NodeInsert in last &&
      isNodeReplaceOperation(current) &&
      !isNodeReplaceOperation(last) &&
      sameRichDocPath(last.p, current.p)
    ) {
      destination[destination.length - 1] = {
        p: [...last.p],
        [RichDocOTActionName.NodeInsert]: OTClone(current[RichDocOTActionName.NodeInsert]),
      } as RichDocOTOperation;
      return;
    }

    // ni followed by nd at same path with same snapshot → noop
    if (
      RichDocOTActionName.NodeInsert in last &&
      RichDocOTActionName.NodeDelete in current &&
      JSON.stringify(last.p) === JSON.stringify(current.p) &&
      JSON.stringify((last as InsertNodeOTOperation)[RichDocOTActionName.NodeInsert]) ===
        JSON.stringify((current as DeleteNodeOTOperation)[RichDocOTActionName.NodeDelete])
    ) {
      destination.pop();
      return;
    }

    // consecutive si on same TextNode
    if (
      RichDocOTActionName.StringInsert in last &&
      RichDocOTActionName.StringInsert in current &&
      haveSameRichDocParent(last.p, current.p)
    ) {
      const prevOffset = last.p[last.p.length - 1] as number;
      const prevStr = (last as InsertStringOTOperation)[RichDocOTActionName.StringInsert];
      const curOffset = current.p[current.p.length - 1] as number;
      if (curOffset === prevOffset + prevStr.length) {
        (last as InsertStringOTOperation)[RichDocOTActionName.StringInsert] =
          prevStr + (current as InsertStringOTOperation)[RichDocOTActionName.StringInsert];
        return;
      }
    }

    // consecutive sd on same TextNode (backspace pattern: same offset)
    if (
      RichDocOTActionName.StringDelete in last &&
      RichDocOTActionName.StringDelete in current &&
      haveSameRichDocParent(last.p, current.p)
    ) {
      const prevOffset = last.p[last.p.length - 1] as number;
      const curOffset = current.p[current.p.length - 1] as number;
      if (curOffset === prevOffset) {
        (last as DeleteStringOTOperation)[RichDocOTActionName.StringDelete] += (current as DeleteStringOTOperation)[
          RichDocOTActionName.StringDelete
        ];
        return;
      }
    }

    // ua on same path: keep prev from last, update value from current
    if (
      RichDocOTActionName.UpdateAttrs in last &&
      RichDocOTActionName.UpdateAttrs in current &&
      JSON.stringify(last.p) === JSON.stringify(current.p)
    ) {
      (last as UpdateAttrsOTOperation)[RichDocOTActionName.UpdateAttrs] = {
        prev: (last as UpdateAttrsOTOperation)[RichDocOTActionName.UpdateAttrs].prev,
        value: (current as UpdateAttrsOTOperation)[RichDocOTActionName.UpdateAttrs].value,
      };
      return;
    }

    destination.push(current);
  }

  /**
   * Composes two sequential rich-document operation lists.
   * @param operation1 - Earlier operation list.
   * @param operation2 - Later operation list.
   * @returns Equivalent composed operation list.
   */
  public static compose(operation1: RichDocOTOperation[], operation2: RichDocOTOperation[]): RichDocOTOperation[] {
    RichDocOT.checkValidOp(operation1 as OTOperation[]);
    RichDocOT.checkValidOp(operation2 as OTOperation[]);

    const result = OTClone(operation1) as RichDocOTOperation[];
    for (const op of operation2) {
      RichDocOT.append(result, op);
    }
    return result;
  }

  /**
   * Transforms one rich-document operation list against concurrent operations.
   * @param operation - Operation list being rebased.
   * @param otherOperation - Concurrent operation list already applied on the target branch.
   * @param type - Tie-break side for equal-position edits.
   * @returns The operation list rebased over otherOperation.
   */
  public static transform(
    operation: RichDocOTOperation[],
    otherOperation: RichDocOTOperation[],
    type: OTTransformPriority,
  ): RichDocOTOperation[] {
    RichDocOT.checkValidOp(operation as OTOperation[]);
    RichDocOT.checkValidOp(otherOperation as OTOperation[]);

    let result: RichDocOTOperation[] = OTClone(operation);

    for (const other of otherOperation) {
      const next: RichDocOTOperation[] = [];
      for (const op of result) {
        const transformed = RichDocOT.transformComponent(OTClone(op), other, type);
        if (transformed !== null) next.push(transformed);
      }
      result = next;
    }

    return result;
  }

  /**
   * Transforms one component over one concurrent component.
   * @param op - Operation being rebased.
   * @param other - Concurrent operation already present on the target branch.
   * @param type - Tie-break side for equal-position edits.
   * @returns The transformed operation, or null when the operation becomes a no-op.
   */
  private static transformComponent(
    op: RichDocOTOperation,
    other: RichDocOTOperation,
    type: OTTransformPriority,
  ): RichDocOTOperation | null {
    // ------------------------------------------------------------------
    // other = ni (node insert)
    // ------------------------------------------------------------------
    if (RichDocOTActionName.NodeInsert in other && !isNodeReplaceOperation(other)) {
      const otherIdx = other.p[other.p.length - 1] as number;

      if (
        (RichDocOTActionName.NodeInsert in op ||
          RichDocOTActionName.NodeDelete in op ||
          RichDocOTActionName.NodeMove in op) &&
        haveSameRichDocParent(op.p, other.p)
      ) {
        const opIdx = op.p[op.p.length - 1] as number;

        if (isNodeReplaceOperation(op)) {
          if (opIdx >= otherIdx) {
            op.p = [...op.p.slice(0, -1), opIdx + 1];
          }
        } else if (RichDocOTActionName.NodeInsert in op) {
          if (opIdx > otherIdx || (opIdx === otherIdx && type === OTTransformPriority.RIGHT)) {
            op.p = [...op.p.slice(0, -1), opIdx + 1];
          }
        } else if (RichDocOTActionName.NodeDelete in op) {
          if (opIdx >= otherIdx) {
            op.p = [...op.p.slice(0, -1), opIdx + 1];
          }
        } else if (RichDocOTActionName.NodeMove in op) {
          const nmOp = op as MoveNodeOTOperation;
          if (opIdx >= otherIdx) {
            op.p = [...op.p.slice(0, -1), opIdx + 1];
          }
          if (nmOp[RichDocOTActionName.NodeMove][0] > otherIdx) {
            nmOp[RichDocOTActionName.NodeMove] = [nmOp[RichDocOTActionName.NodeMove][0] + 1];
          }
        }
      } else {
        // si / sd / ua / cross-tree: adjust any path segment that crosses the insertion
        op = RichDocOT.adjustPathForNodeInsert(op, other.p, otherIdx);
      }
      return op;
    }

    // ------------------------------------------------------------------
    // other = nd (node delete)
    // ------------------------------------------------------------------
    if (RichDocOTActionName.NodeDelete in other && !isNodeReplaceOperation(other)) {
      const otherIdx = other.p[other.p.length - 1] as number;
      const deletedPath = other.p;

      // op path goes through deleted node
      if (isStrictRichDocPathPrefix(deletedPath, op.p)) return null;

      if (
        (RichDocOTActionName.NodeInsert in op ||
          RichDocOTActionName.NodeDelete in op ||
          RichDocOTActionName.NodeMove in op) &&
        haveSameRichDocParent(op.p, other.p)
      ) {
        const opIdx = op.p[op.p.length - 1] as number;

        if (isNodeReplaceOperation(op)) {
          if (opIdx === otherIdx) {
            // The old value of this replacement was deleted concurrently.
            // Keep the new value as an insert at the surviving list index.
            return {
              p: [...op.p],
              [RichDocOTActionName.NodeInsert]: OTClone(op[RichDocOTActionName.NodeInsert]),
            } as RichDocOTOperation;
          }
          if (opIdx > otherIdx) op.p = [...op.p.slice(0, -1), opIdx - 1];
        } else if (RichDocOTActionName.NodeDelete in op) {
          if (opIdx === otherIdx) return null; // concurrent delete same node
          if (opIdx > otherIdx) op.p = [...op.p.slice(0, -1), opIdx - 1];
        } else if (RichDocOTActionName.NodeInsert in op) {
          if (opIdx > otherIdx) op.p = [...op.p.slice(0, -1), opIdx - 1];
        } else if (RichDocOTActionName.NodeMove in op) {
          const nmOp = op as MoveNodeOTOperation;
          if (opIdx === otherIdx) return null; // source deleted
          if (opIdx > otherIdx) op.p = [...op.p.slice(0, -1), opIdx - 1];
          if (nmOp[RichDocOTActionName.NodeMove][0] > otherIdx) {
            nmOp[RichDocOTActionName.NodeMove] = [nmOp[RichDocOTActionName.NodeMove][0] - 1];
          }
        }
      } else {
        // si / sd / ua / cross-tree: check if the op's path is affected
        const adjusted = RichDocOT.adjustPathForNodeDelete(op, other.p, otherIdx);
        if (adjusted === null) return null;
        op = adjusted;
      }
      return op;
    }

    // ------------------------------------------------------------------
    // other = node replacement (JSON0 ld + li)
    // ------------------------------------------------------------------
    if (isNodeReplaceOperation(other)) {
      const otherIdx = other.p[other.p.length - 1] as number;

      if (
        (RichDocOTActionName.NodeInsert in op ||
          RichDocOTActionName.NodeDelete in op ||
          RichDocOTActionName.NodeMove in op) &&
        haveSameRichDocParent(op.p, other.p)
      ) {
        const opIdx = op.p[op.p.length - 1] as number;
        if (opIdx !== otherIdx) {
          if (opIdx > otherIdx) op.p = [...op.p.slice(0, -1), opIdx];
          return op;
        }

        if (isNodeReplaceOperation(op)) {
          // Two replacements of one list element use the transform priority
          // as their deterministic conflict winner, exactly like JSON0.
          if (type === OTTransformPriority.RIGHT) return null;
          return {
            p: [...op.p],
            [RichDocOTActionName.NodeDelete]: OTClone(other[RichDocOTActionName.NodeInsert]),
            [RichDocOTActionName.NodeInsert]: OTClone(op[RichDocOTActionName.NodeInsert]),
          } as RichDocOTOperation;
        }
        if (RichDocOTActionName.NodeDelete in op) return null;
        // A pure insert at the replacement index remains an insert before the
        // concurrently replaced element.
        return op;
      }

      // Attribute/string operations below a replaced node no longer have a
      // valid target. Path adjustment handles the ancestor case.
      const adjusted = RichDocOT.adjustPathForNodeDelete(op, other.p, otherIdx);
      if (adjusted === null) return null;
      return adjusted;
    }

    // ------------------------------------------------------------------
    // other = nm (node move within same parent)
    // ------------------------------------------------------------------
    if (RichDocOTActionName.NodeMove in other) {
      const otherFrom = other.p[other.p.length - 1] as number;
      const otherTo = (other as MoveNodeOTOperation)[RichDocOTActionName.NodeMove][0];

      if (
        (RichDocOTActionName.NodeInsert in op ||
          RichDocOTActionName.NodeDelete in op ||
          RichDocOTActionName.NodeMove in op) &&
        haveSameRichDocParent(op.p, other.p)
      ) {
        const opIdx = op.p[op.p.length - 1] as number;

        if (RichDocOTActionName.NodeMove in op) {
          const nmOp = op as MoveNodeOTOperation;
          const opFrom = opIdx;
          const opTo = nmOp[RichDocOTActionName.NodeMove][0];

          const newFrom = RichDocOT.transformIdxForMove(opFrom, otherFrom, otherTo);
          const newTo = RichDocOT.transformIdxForMove(opTo, otherFrom, otherTo);
          op.p = [...op.p.slice(0, -1), newFrom];
          nmOp[RichDocOTActionName.NodeMove] = [newTo];
        } else {
          const newIdx = RichDocOT.transformIdxForMove(opIdx, otherFrom, otherTo);
          op.p = [...op.p.slice(0, -1), newIdx];
        }
      }
      return op;
    }

    // ------------------------------------------------------------------
    // other = si (string insert)
    // ------------------------------------------------------------------
    if (RichDocOTActionName.StringInsert in other) {
      const otherOffset = other.p[other.p.length - 1] as number;
      const otherLen = (other as InsertStringOTOperation)[RichDocOTActionName.StringInsert].length;

      if (
        (RichDocOTActionName.StringInsert in op || RichDocOTActionName.StringDelete in op) &&
        haveSameRichDocParent(op.p, other.p)
      ) {
        const opOffset = op.p[op.p.length - 1] as number;

        if (RichDocOTActionName.StringInsert in op) {
          if (opOffset > otherOffset || (opOffset === otherOffset && type === OTTransformPriority.RIGHT)) {
            op.p = [...op.p.slice(0, -1), opOffset + otherLen];
          }
        } else if (RichDocOTActionName.StringDelete in op) {
          if (opOffset >= otherOffset + otherLen) {
            op.p = [...op.p.slice(0, -1), opOffset + otherLen];
          } else if (opOffset >= otherOffset) {
            // deletion start is inside the inserted region → fold
            op.p = [...op.p.slice(0, -1), otherOffset + otherLen];
          }
          // else opOffset < otherOffset: unchanged
        }
      }
      return op;
    }

    // ------------------------------------------------------------------
    // other = sd (string delete)
    // ------------------------------------------------------------------
    if (RichDocOTActionName.StringDelete in other) {
      const otherOffset = other.p[other.p.length - 1] as number;
      const otherLen = (other as DeleteStringOTOperation)[RichDocOTActionName.StringDelete].length;

      if (
        (RichDocOTActionName.StringInsert in op || RichDocOTActionName.StringDelete in op) &&
        haveSameRichDocParent(op.p, other.p)
      ) {
        const opOffset = op.p[op.p.length - 1] as number;

        if (RichDocOTActionName.StringInsert in op) {
          if (opOffset <= otherOffset) {
            // no change
          } else if (opOffset > otherOffset + otherLen) {
            op.p = [...op.p.slice(0, -1), opOffset - otherLen];
          } else {
            // insertion point inside deleted region → fold to deletion start
            op.p = [...op.p.slice(0, -1), otherOffset];
          }
        } else if (RichDocOTActionName.StringDelete in op) {
          const sdOp = op as DeleteStringOTOperation;
          const opLen = sdOp[RichDocOTActionName.StringDelete].length;
          const opEnd = opOffset + opLen;
          const otherEnd = otherOffset + otherLen;

          if (opEnd <= otherOffset || opOffset >= otherEnd) {
            // no overlap
            if (opOffset >= otherEnd) {
              op.p = [...op.p.slice(0, -1), opOffset - otherLen];
            }
            // else opOffset < otherOffset: unchanged
          } else {
            // overlap exists
            const overlapStart = Math.max(opOffset, otherOffset);
            const overlapEnd = Math.min(opEnd, otherEnd);

            if (opOffset >= otherOffset && opEnd <= otherEnd) {
              // op is fully inside other → noop
              return null;
            }

            // partial overlap: remove overlapping portion
            const overlapLen = overlapEnd - overlapStart;
            const newStr =
              sdOp[RichDocOTActionName.StringDelete].slice(0, overlapStart - opOffset) +
              sdOp[RichDocOTActionName.StringDelete].slice(overlapEnd - opOffset);

            if (newStr.length === 0) return null;

            sdOp[RichDocOTActionName.StringDelete] = newStr;
            // new offset: if op started before other, offset unchanged; else fold to otherOffset
            const newOffset = opOffset < otherOffset ? opOffset : otherOffset;
            // also adjust for characters deleted by other before our new start
            const shift = opOffset < otherOffset ? 0 : -(opOffset - otherOffset);
            op.p = [...op.p.slice(0, -1), newOffset < otherOffset ? newOffset : otherOffset];
          }
        }
      }
      return op;
    }

    // ------------------------------------------------------------------
    // other = ua (update attrs)
    // ------------------------------------------------------------------
    if (RichDocOTActionName.UpdateAttrs in other) {
      if (RichDocOTActionName.UpdateAttrs in op && JSON.stringify(op.p) === JSON.stringify(other.p)) {
        // same attribute path conflict
        if (type === OTTransformPriority.RIGHT) return null; // RIGHT yields
        // LEFT wins: keep op as-is
      }
      return op;
    }

    return op;
  }

  /**
   * Adjusts paths that cross through a concurrent node insertion.
   * @param op - Operation whose path may shift.
   * @param insertedPath - Path where the node insert happened.
   * @param insertedIdx - Sibling index inserted by the concurrent operation.
   * @returns The operation with its path rebased over the insertion.
   */
  private static adjustPathForNodeInsert(
    op: RichDocOTOperation,
    insertedPath: RichDocOTOperationPath,
    insertedIdx: number,
  ): RichDocOTOperation {
    return adjustRichDocPathForNodeInsert(op, insertedPath, insertedIdx);
  }

  /**
   * Adjusts or removes paths affected by a concurrent node deletion.
   * @param op - Operation whose path may shift.
   * @param deletedPath - Path where the node delete happened.
   * @param deletedIdx - Sibling index removed by the concurrent operation.
   * @returns The adjusted operation, or null when its target was deleted.
   */
  private static adjustPathForNodeDelete(
    op: RichDocOTOperation,
    deletedPath: RichDocOTOperationPath,
    deletedIdx: number,
  ): RichDocOTOperation | null {
    return adjustRichDocPathForNodeDelete(op, deletedPath, deletedIdx);
  }

  /**
   * Adjusts one sibling index after a concurrent node move.
   * @param idx - Index to rebase.
   * @param from - Source index of the concurrent move.
   * @param to - Destination index of the concurrent move.
   * @returns The index rebased over the move.
   */
  private static transformIdxForMove(idx: number, from: number, to: number): number {
    return transformIndexForMove(idx, from, to);
  }
}

function isNodeReplaceOperation(operation: RichDocOTOperation): operation is ReplaceNodeOTOperation {
  return RichDocOTActionName.NodeInsert in operation && RichDocOTActionName.NodeDelete in operation;
}

function sameRichDocPath(left: RichDocOTOperationPath, right: RichDocOTOperationPath): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function cloneOptional<T>(value: T): T {
  return value === void 0 ? value : OTClone(value);
}
