import { SearError } from '@searsuite/sear-foundation-error';
import { RenderContext } from '@searsuite/sear-render-context';
import { Node, NodeProperties } from '@searsuite/sear-render-node';
import { PositionRect } from '@searsuite/sear-foundation-rect';

import { RenderStrategy } from './RenderStrategy';
import { Injectable } from '@searsuite/sear-foundation-di';
import { HexColor } from '@searsuite/sear-foundation-utils';

/**
 * StickyRenderStrategy is responsible for rendering all StickyNode instances.
 * It should be used after the main render strategy to overlay sticky elements.
 */
@Injectable()
export class StickyRenderStrategy<
  NodeTypeProperties extends NodeProperties,
> extends RenderStrategy<NodeTypeProperties> {
  /** DI token for resolving StickyRenderStrategy. */
  public static readonly symbol = Symbol.for('StickyRenderStrategy');

  /** Marks whether sticky layer has completed its first render pass. */
  private isFirstRender: boolean = true;
  /**
   * Renders all StickyNode descendants of the given node.
   * Sticky nodes are positioned according to their sticky logic (top/left).
   * @param node The root node to search for StickyNode descendants.
   */
  render(node: Node<NodeTypeProperties>): void {
    // if (!this.isScrollStateChanged && this.hasRendered) return;
    // Previous implementation: skip re-render on non-scroll frames if already rendered.
    // However, this caused new sticky highlight nodes added via dispatch (e.g., selection changes)
    // to be picked up only by DirtyRenderStrategy, which applies (-scrollX, -scrollY) transform
    // to all nodes—incorrect for sticky elements. Changed approach: always redraw sticky nodes
    // in visible region on every render() call. Visible region sticky count is constrained
    // (only visible headers + corner + highlights), so performance impact is acceptable.
    const positionRect = this.scrollManager.getPositionRect();
    const { x, y } = this.scrollState;

    this.renderAffix(node, new PositionRect(0, y, positionRect.width, y + positionRect.height), isLeftAffixNode, [
      1,
      0,
      0,
      1,
      0,
      -y,
    ]);
    this.renderAffix(node, new PositionRect(x, 0, x + positionRect.width, positionRect.height), isTopAffixNode, [
      1,
      0,
      0,
      1,
      -x,
      0,
    ]);
    this.renderAffix(node, positionRect, isCornerAffixNode, [1, 0, 0, 1, 0, 0]);
    this.isFirstRender = false;
  }

  /** Lets SearCoreSheet paint sticky content after the batched base scroll frame. */
  protected override shouldRenderOnScroll(): boolean {
    return false;
  }

  /**
   * Queries and renders one sticky group using a dedicated transform.
   *
   * Groups are split by sticky mode to ensure each category receives the
   * correct transform behavior during scrolling.
   */
  private renderAffix(
    node: Node<NodeTypeProperties>,
    rect: PositionRect<HexColor>,
    filterFn: (n: Node<NodeTypeProperties>) => boolean,
    transform: [number, number, number, number, number, number],
  ) {
    const queryResults = node.query(rect);
    const affixNodes: Node<NodeTypeProperties>[] = [];
    for (const candidate of queryResults) {
      // Edit overlays (including fixed-row selection outlines) are painted by
      // OverlayRenderStrategy. Clearing their bounds here erases the cell below
      // on raster targets before the stroke-only overlay is drawn.
      if (candidate.sticky && !candidate.properties?.isEdit && filterFn(candidate)) affixNodes.push(candidate);
    }

    if (affixNodes.length === 0) return;

    this.renderContext.save();
    this.renderContext.setTransform(...transform);
    for (const child of affixNodes) {
      if (this.renderContext.requiresExplicitNodeClear()) child.clear(this.renderContext);
      child.drawScene(this.renderContext);
    }
    this.renderContext.setTransform(1, 0, 0, 1, 0, 0);
    this.renderContext.restore();
  }

  /**
   * Returns the current render context.
   */
  getContext(): RenderContext {
    return this.renderContext;
  }

  /**
   * Not implemented: Finds nodes at the given coordinates.
   * @throws Error
   */
  getNodeByCoordinates(node: Node<NodeTypeProperties>, x: number, y: number): Node<NodeTypeProperties>[] {
    throw new SearError('StickyRenderStrategy.getNodeByCoordinates is not supported; use HitRenderStrategy for coordinate lookup.');
  }
}

function isLeftAffixNode<NodeTypeProperties extends NodeProperties>(node: Node<NodeTypeProperties>): boolean {
  return node.top === void 0 && node.left !== void 0;
}

function isTopAffixNode<NodeTypeProperties extends NodeProperties>(node: Node<NodeTypeProperties>): boolean {
  return node.top !== void 0 && node.left === void 0;
}

function isCornerAffixNode<NodeTypeProperties extends NodeProperties>(node: Node<NodeTypeProperties>): boolean {
  return node.top !== void 0 && node.left !== void 0;
}
