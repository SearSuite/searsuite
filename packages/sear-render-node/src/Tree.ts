import { PositionRect } from '@searsuite/sear-foundation-rect';
import { HexColor } from '@searsuite/sear-foundation-utils';

/** Shared spatial-index contract. The item shape is owned by each index. */
export abstract class Tree<T> {
  /** DI token for resolving Tree. */
  public static readonly symbol: symbol = Symbol.for('Tree');
  /** The parent spatial node, or null at the root. */
  public parent: Tree<T> | null = null;

  protected boundary: PositionRect<HexColor>;
  /** The maximum number of entries retained by this spatial node. */
  public readonly capacity: number;

  /** Creates a Tree instance. */
  constructor(boundary: PositionRect<HexColor>, capacity: number) {
    this.boundary = boundary;
    this.capacity = capacity;
  }

  /** Inserts a bounded entry into the spatial index. */
  abstract insert(item: T): boolean;
  /** Removes the value. */
  abstract remove(item: T, predicate?: (rect: PositionRect<HexColor>) => boolean): boolean;
  /** Clears state owned by Tree. */
  abstract clear(): void;
  /** Returns indexed entries whose boundaries intersect the supplied rectangle. */
  abstract query(range: PositionRect<HexColor>): T[];

  /** Returns the boundary. */
  abstract getBoundary(): PositionRect<HexColor>;
  /** Updates the indexed boundary after geometry changes. */
  abstract updateBoundary(boundary: PositionRect<HexColor>): void;

  /** Serializes this scene structure into diagnostic JSON. */
  abstract toJSON?(): object;
}

/** Public contract for TreeFactory. */
export interface TreeFactory<T> {
  create(boundary: PositionRect<HexColor>, capacity: number): Tree<T>;
}
