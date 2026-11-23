import { PositionRect } from '@searsuite/sear-foundation-rect';
import { HexColor } from '@searsuite/sear-foundation-utils';

/** Internal KD-tree node containing one rectangular item. */
export class KDTreeNode<T extends { rect: PositionRect<HexColor> }> {
  /** Constructs a KD-tree node with optional left and right children. */
  public constructor(
    public data: T,
    public left: KDTreeNode<T> | null = null,
    public right: KDTreeNode<T> | null = null,
  ) {}
}
