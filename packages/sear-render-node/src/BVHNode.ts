import { PositionRect } from '@searsuite/sear-foundation-rect';
import { HexColor } from '@searsuite/sear-foundation-utils';

/** Internal BVH node used by the simple bounding-volume hierarchy implementation. */
export class BVHNode<T extends { rect: PositionRect<HexColor> }> {
  /** Child nodes contained by this bounding volume. */
  public children: BVHNode<T>[] = [];

  /** Constructs a BVH node with optional payload data. */
  public constructor(public rect: PositionRect<HexColor>, public data: T | null = null) {}
}
