import { PositionRect } from '@searsuite/sear-foundation-rect';
import { HexColor } from '@searsuite/sear-foundation-utils';

import { Tree } from './Tree';

/**
 * Frame-scoped dirty-region tracker.
 *
 * A scene mutation may replace several view extensions before the render pass starts.
 * Every affected region must therefore remain recorded until
 * DirtyRenderStrategy has consumed the frame.  In particular, node replacement
 * must never clear regions recorded by an earlier replacement in that frame.
 *
 */
export class FrameDirtyTracker {
  readonly #tree: Tree<PositionRect<HexColor>>;

  /** DI token for resolving FrameDirtyTracker. */
  public static readonly symbol: symbol = Symbol.for('FrameDirtyTracker');

  readonly #entries = new Set<PositionRect<HexColor>>();

  /** Creates a FrameDirtyTracker instance. */
  constructor(tree: Tree<PositionRect<HexColor>>) {
    this.#tree = tree;
  }

  /** Records a region until the current dirty render pass finishes. */
  mark(rect: PositionRect<HexColor>): void {
    if (this.#entries.has(rect)) return;

    const boundary = this.#tree.getBoundary();
    const expandedBoundary = PositionRect.merge(boundary, rect);
    if (
      expandedBoundary.x !== boundary.x ||
      expandedBoundary.y !== boundary.y ||
      expandedBoundary.width !== boundary.width ||
      expandedBoundary.height !== boundary.height
    ) {
      this.#tree.updateBoundary(expandedBoundary);
    }

    this.#entries.add(rect);
    this.#tree.insert(rect);
  }

  /**
   * Frame-end full cleanup (called by DirtyRenderStrategy.render()).
   * All items are removed regardless of generation.
   */
  clear(): void {
    this.#entries.clear();
    this.#tree.clear();
  }

  /** Returns dirty regions intersecting the supplied frame bounds. */
  query(range: PositionRect<HexColor>): PositionRect<HexColor>[] {
    return this.#tree.query(range);
  }

  /** Returns the boundary. */
  getBoundary(): PositionRect<HexColor> {
    return this.#tree.getBoundary();
  }
}
