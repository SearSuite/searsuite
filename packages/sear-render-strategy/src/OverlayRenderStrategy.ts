import { SearError } from '@searsuite/sear-foundation-error';
import { Injectable } from '@searsuite/sear-foundation-di';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { RenderContext } from '@searsuite/sear-render-context';
import { HexColor } from '@searsuite/sear-foundation-utils';
import { Node, NodeProperties, type RichTextSelectionRect } from '@searsuite/sear-render-node';

import { RenderStrategy } from './RenderStrategy';

/**
 * Render pass that paints editor overlays at the very end of the pipeline.
 *
 * This pass guarantees edit-mode visuals stay above sticky headers and any
 * other layers by drawing nodes with `isEdit` after StickyRenderStrategy.
 */
@Injectable()
export class OverlayRenderStrategy<
  NodeTypeProperties extends NodeProperties,
> extends RenderStrategy<NodeTypeProperties> {
  /** DI token for resolving OverlayRenderStrategy. */
  public static readonly symbol = Symbol.for('OverlayRenderStrategy');

  /** Renders OverlayRenderStrategy scene output. */
  render(node: Node<NodeTypeProperties>): void {
    const positionRect = this.scrollManager.getPositionRect();
    const { x, y } = this.scrollState;

    const visibleRect = new PositionRect<HexColor>(
      positionRect.x + x,
      positionRect.y + y,
      positionRect.width,
      positionRect.height,
    );

    const overlayNodes: Node<NodeTypeProperties>[] = [];
    const textBlocks: Node<NodeTypeProperties>[] = [];
    for (const candidate of node.query(visibleRect)) {
      if (candidate.properties.isEdit && !candidate.sticky) overlayNodes.push(candidate);
      else if (isRichTextNode(candidate, 'block')) textBlocks.push(candidate);
    }

    if (overlayNodes.length === 0 && !this.hasStickyOverlays(node, positionRect.width, positionRect.height)) return;

    this.renderContext.save();
    try {
      this.renderContext.setTransform(1, 0, 0, 1, -x, -y);
      for (const overlayNode of overlayNodes) {
        const clip = overlayNode.properties.overlayClipRect;
        this.renderContext.beginNodeSemantics({
          owner: overlayNode.properties.semanticOwner,
          role: overlayNode.properties.semanticRole,
        });
        try {
          overlayNode.drawScene(
            this.renderContext,
            clip ? new PositionRect<HexColor>(clip.x, clip.y, clip.width, clip.height) : visibleRect,
          );
          if (isRichTextSelection(overlayNode)) {
            this.paintSelectedText(overlayNode, textBlocks, visibleRect);
          }
        } finally {
          this.renderContext.endNodeSemantics();
        }
      }
      this.renderStickyOverlays(node, positionRect.width, positionRect.height);
    } finally {
      this.renderContext.setTransform(1, 0, 0, 1, 0, 0);
      this.renderContext.restore();
    }
  }

  private hasStickyOverlays(node: Node<NodeTypeProperties>, width: number, height: number): boolean {
    return this.stickyGroups(width, height).some(({ rect, accepts }) =>
      node.query(rect).some((candidate) => candidate.properties.isEdit && candidate.sticky && accepts(candidate)));
  }

  private renderStickyOverlays(node: Node<NodeTypeProperties>, width: number, height: number): void {
    for (const { rect, transform, accepts } of this.stickyGroups(width, height)) {
      const candidates = node.query(rect).filter((candidate) =>
        candidate.properties.isEdit && candidate.sticky && accepts(candidate));
      if (candidates.length === 0) continue;
      this.renderContext.save();
      this.renderContext.setTransform(...transform);
      for (const candidate of candidates) {
        this.renderContext.beginNodeSemantics({
          owner: candidate.properties.semanticOwner,
          role: candidate.properties.semanticRole,
        });
        try {
          candidate.drawScene(this.renderContext, rect);
        } finally {
          this.renderContext.endNodeSemantics();
        }
      }
      this.renderContext.restore();
    }
  }

  private stickyGroups(width: number, height: number): readonly {
    rect: PositionRect<HexColor>;
    transform: [number, number, number, number, number, number];
    accepts: (candidate: Node<NodeTypeProperties>) => boolean;
  }[] {
    const { x, y } = this.scrollState;
    return [
      { rect: new PositionRect(0, y, width, height), transform: [1, 0, 0, 1, 0, -y],
        accepts: (candidate) => candidate.left !== void 0 && candidate.top === void 0 },
      { rect: new PositionRect(x, 0, width, height), transform: [1, 0, 0, 1, -x, 0],
        accepts: (candidate) => candidate.top !== void 0 && candidate.left === void 0 },
      { rect: new PositionRect(0, 0, width, height), transform: [1, 0, 0, 1, 0, 0],
        accepts: (candidate) => candidate.top !== void 0 && candidate.left !== void 0 },
    ];
  }

  private paintSelectedText(
    selection: Node<NodeTypeProperties> & { getSelectionRects(): readonly RichTextSelectionRect[] },
    textBlocks: readonly Node<NodeTypeProperties>[],
    visibleRect: PositionRect<HexColor>,
  ): void {
    const rects = selection.getSelectionRects();
    if (rects.length === 0 || textBlocks.length === 0) return;
    this.renderContext.save();
    try {
      this.renderContext.beginPath();
      for (const rect of rects) this.renderContext.rect(rect.x, rect.y, rect.width, rect.height);
      this.renderContext.clip();
      for (const block of textBlocks) block.drawScene(this.renderContext, visibleRect);
    } finally {
      this.renderContext.restore();
    }
  }

  /** Lets SearCoreSheet paint overlays after the batched base scroll frame. */
  protected override shouldRenderOnScroll(): boolean {
    return false;
  }

  /** Returns the context. */
  getContext(): RenderContext {
    return this.renderContext;
  }

  /** Returns the node by coordinates. */
  getNodeByCoordinates(node: Node<NodeTypeProperties>, x: number, y: number): Node<NodeTypeProperties>[] {
    throw new SearError('OverlayRenderStrategy.getNodeByCoordinates is not supported; use HitRenderStrategy for coordinate lookup.');
  }
}

function isRichTextNode<T extends NodeProperties>(node: Node<T>, role: string): boolean {
  return node.properties.semanticOwner === 'rich-text' && node.properties.semanticRole === role;
}

function isRichTextSelection<T extends NodeProperties>(
  node: Node<T>,
): node is Node<T> & { getSelectionRects(): readonly RichTextSelectionRect[] } {
  return isRichTextNode(node, 'selection') && 'getSelectionRects' in node && typeof node.getSelectionRects === 'function';
}
