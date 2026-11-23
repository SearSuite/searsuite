import { PositionRect } from '@searsuite/sear-foundation-rect';
import { HexColor } from '@searsuite/sear-foundation-utils';

/** Internal node used by the simple Octree-compatible index. */
export class OctreeNode<T extends { rect: PositionRect<HexColor> }> {
  /** Child nodes retained under this node. */
  public children: OctreeNode<T>[] = [];

  /** Constructs an Octree node with optional payload data. */
  public constructor(public rect: PositionRect<HexColor>, public data: T | null = null) {}
}
