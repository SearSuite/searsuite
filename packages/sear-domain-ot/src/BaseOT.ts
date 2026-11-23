import { SearError } from '@searsuite/sear-foundation-error';

/** Address of a value inside an OT-managed tree, list, or matrix-like structure. */
export type OTOperationPath = (string | number)[];

/** Minimal operation contract shared by every domain OT implementation. */
export interface OTOperation {
  /** Path locating the operation target inside the snapshot. */
  p: OTOperationPath;
}

/** Tie-break direction used when two concurrent operations target the same position. */
export enum OTTransformPriority {
  LEFT = 'left',
  RIGHT = 'right',
}

/** Deep-clones JSON-compatible OT payloads before mutation or composition. */
export function OTClone<T>(object: T): T {
  return JSON.parse(JSON.stringify(object));
}

/**
 * Base class for Operational Transformation implementations.
 *
 * Concrete domains provide the actual apply, append, compose, and transform
 * semantics while sharing validation and creation helpers here.
 */
export abstract class BaseOT {
  /** Human-readable OT implementation name for diagnostics and debugging. */
  public readonly name: string;

  /**
   * Constructs an OT implementation descriptor.
   * @param name - Stable implementation name.
   */
  constructor(name: string) {
    this.name = name;
  }

  /**
   * Creates an operation list snapshot.
   * @param data - Optional operations to clone into the new list.
   * @returns A mutable operation list detached from the caller's array.
   */
  public static create(data?: OTOperation[]): OTOperation[] {
    return data === void 0 ? [] : OTClone(data);
  }

  /**
   * Validates the structural contract common to all operations.
   * @param operations - Operations that must each carry an array path.
   * @throws SearError when an operation is missing its path.
   */
  public static checkValidOp(operations: OTOperation[]) {
    for (let i = 0; i < operations.length; i++) {
      if (!Array.isArray(operations[i].p)) throw new SearError('Missing path');
    }
  }

  /**
   * Applies operations to a domain snapshot.
   * @throws SearError until implemented by a concrete OT class.
   */
  public static apply(snapshot: unknown, operations: OTOperation[]) {
    throw new SearError('BaseOT.apply must be implemented by concrete OT classes.');
  }

  /**
   * Appends one operation into a composed destination list.
   * @throws SearError until implemented by a concrete OT class.
   */
  public static append(destination: OTOperation[], current: OTOperation): void {
    throw new SearError('BaseOT.append must be implemented by concrete OT classes.');
  }

  /**
   * Composes two sequential operation lists into one equivalent list.
   * @throws SearError until implemented by a concrete OT class.
   */
  public static compose(operation1: OTOperation[], operation2: OTOperation[]): OTOperation[] {
    throw new SearError('BaseOT.compose must be implemented by concrete OT classes.');
  }

  /**
   * Transforms an operation list against concurrent operations.
   * @throws SearError until implemented by a concrete OT class.
   */
  public static transform(
    operation: OTOperation[],
    otherOperation: OTOperation[],
    type: OTTransformPriority,
  ): OTOperation[] {
    throw new SearError('BaseOT.transform must be implemented by concrete OT classes.');
  }
}
