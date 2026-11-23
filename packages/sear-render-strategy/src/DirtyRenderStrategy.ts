import { SearError } from '@searsuite/sear-foundation-error';
import { Node, NodeProperties } from '@searsuite/sear-render-node';
import { RenderContext } from '@searsuite/sear-render-context';
import { HexColor } from '@searsuite/sear-foundation-utils';

import { RenderStrategy } from './RenderStrategy';
import { Injectable } from '@searsuite/sear-foundation-di';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { DirtyRegionCollector } from './DirtyRegionCollector';
import { clearViewportRect, supportsViewportDirtyRedraw, worldRectToViewportClearRect } from './ViewportRenderHelpers';

/**
 * Incremental renderer that redraws only dirty regions.
 *
 * It reads dirty rectangles from the registered dirty tracker, clears those
 * regions on both on-screen and off-screen contexts, redraws intersected nodes,
 * and finally resets the dirty tracker.
 *
 * @template NodeTypeProperties Node property shape used by the render tree.
 */
@Injectable()
export class DirtyRenderStrategy<NodeTypeProperties extends NodeProperties> extends RenderStrategy<NodeTypeProperties> {
  /** DI token for resolving DirtyRenderStrategy. */
  public static readonly symbol = Symbol.for('DirtyRenderStrategy');

  /** @internal Compatibility shim for existing geometry-focused tests. */
  private static dedupePoints(points: [number, number][]): [number, number][] {
    return DirtyRegionCollector.dedupePoints(points);
  }

  /** @internal Compatibility shim for existing geometry-focused tests. */
  private static removeCollinear(points: [number, number][]): [number, number][] {
    return DirtyRegionCollector.removeCollinear(points);
  }

  /** @internal Compatibility shim for existing geometry-focused tests. */
  private static traceUnionBoundary(
    rectA: { x1: number; y1: number; x2: number; y2: number },
    rectB: { x1: number; y1: number; x2: number; y2: number },
  ): [number, number][] {
    return DirtyRegionCollector.traceUnionBoundary(rectA, rectB);
  }

  /**
   * Redraws all dirty regions for both render targets.
   *
   * Each dirty rect is processed atomically: clearRect followed immediately by
   * redraw of intersecting nodes.  This guarantees that a later rect's clear
   * can erase pixels re-painted by an earlier rect's redraw — critical for
   * cases like cell-editor exit where the overflow area must stay clean
   * despite the grid cell's TextNode redrawing overflow text into it.
   */
  render(node: Node<NodeTypeProperties>): void {
    // debugger;
    const collector = new DirtyRegionCollector<HexColor>(this.dirtyTree);
    if (!supportsViewportDirtyRedraw(this.renderContext)) {
      collector.clear();
      return;
    }
    // 1) Pull all dirty rects accumulated in this frame.
    // If there are no dirty areas, skip the entire dirty pass.
    const dirtyPositionRects = collector.collect();
    if (!dirtyPositionRects.length) return;
    const { scrollState } = this;

    // Max stroke width used as erase padding to avoid edge ghosting.
    const lineWidth = this.renderContext.getMaxLineWidth();

    // 2) Process each dirty rect atomically: clear, then redraw.
    //    This ensures later clears can erase pixels painted by earlier redraws.
    for (const rect of dirtyPositionRects) {
      // ── Clear phase (screen coordinates, identity transform) ──────────
      const clearRect = worldRectToViewportClearRect(rect, scrollState.x, scrollState.y, lineWidth / 2);
      clearViewportRect(this.renderContext, clearRect);
      clearViewportRect(this.offScreenRenderContext, clearRect);

      // ── Redraw phase (world coordinates with scroll offset) ───────────
      const intersectingNodes: Node<NodeTypeProperties>[] = [];
      for (const candidate of node.query(rect)) {
        // Sticky nodes are handled by StickyRenderStrategy, not DirtyRenderStrategy.
        // Edit nodes (selection, cell editor, resize guide) are handled exclusively
        // by OverlayRenderStrategy which runs last and guarantees they stay on top.
        if (!candidate.sticky && !candidate.properties?.isEdit) intersectingNodes.push(candidate);
      }

      // Depth sort to preserve z-order within this rect.
      intersectingNodes.sort(compareNodeDepth);

      this.renderContext.save();
      this.renderContext.setTransform(1, 0, 0, 1, -scrollState.x, -scrollState.y);
      this.offScreenRenderContext.save();
      this.offScreenRenderContext.setTransform(1, 0, 0, 1, -scrollState.x, -scrollState.y);

      for (const intersectingNode of intersectingNodes) {
        const nodeLineWidth = Math.max(lineWidth, intersectingNode.strokeWidth ?? 0);

        const shouldUseSelectionClip = Boolean(intersectingNode.properties?.shouldBeClipInDirtyRender);
        const nodeRect = new PositionRect<HexColor>(
          intersectingNode.x,
          intersectingNode.y,
          intersectingNode.width,
          intersectingNode.height,
        );
        const clipRegion = DirtyRegionCollector.createClipRegion(rect, nodeRect, nodeLineWidth, shouldUseSelectionClip);

        // Render both targets so incremental scroll copy remains consistent.
        intersectingNode.drawScene(this.renderContext, clipRegion);
        intersectingNode.drawScene(this.offScreenRenderContext, clipRegion);
      }

      this.renderContext.restore();
      this.offScreenRenderContext.restore();
    }

    // 3) Dirty work for this frame is done.
    collector.clear();
  }

  /** Dirty work is consumed by the coordinated render frame, not by scroll events. */
  protected override shouldRenderOnScroll(): boolean {
    return false;
  }

  /**
   * Returns the screen render context used by this strategy.
   */
  getContext(): RenderContext {
    return this.renderContext;
  }

  /**
   * Dirty strategy does not currently expose coordinate lookup.
   *
   * @throws Error Always thrown until this API is implemented.
   */
  getNodeByCoordinates(node: Node<NodeTypeProperties>, x: number, y: number): Node<NodeTypeProperties>[] {
    throw new SearError(
      'DirtyRenderStrategy.getNodeByCoordinates is not supported; use HitRenderStrategy for coordinate lookup.',
    );
  }
}

function compareNodeDepth<NodeTypeProperties extends NodeProperties>(
  first: Node<NodeTypeProperties>,
  second: Node<NodeTypeProperties>,
): number {
  return first.depth - second.depth;
}
