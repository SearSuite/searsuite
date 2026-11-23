import { PositionRect } from '@searsuite/sear-foundation-rect';
import { HexColor } from '@searsuite/sear-foundation-utils';

/** Internal node used by the simple R-tree implementation. */
export class RTreeNode<T extends { rect: PositionRect<HexColor> }> {
  /** Child nodes retained under this node. */
  public children: RTreeNode<T>[] = [];

  /** Constructs an R-tree node with optional payload data. */
  public constructor(public rect: PositionRect<HexColor>, public data: T | null = null) {}
}
