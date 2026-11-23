import { type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { RenderContext } from '@searsuite/sear-render-context';

import { type ClipRegion } from './Node';
import {
  type RichTextBlockId,
  type RichTextRenderLine,
} from './RichTextRenderNodeTypes';
import { RichTextLineRenderer } from './RichTextLinePainter';
import { applyClip } from './RichTextRenderNodeUtils';
import { RichTextVisualNode } from './RichTextVisualNode';

/** Scene node that indexes and draws one top-level rich-text block. */
export class RichTextBlockNode extends RichTextVisualNode {
  private readonly lines: readonly RichTextRenderLine[];
  private readonly font: string;
  private readonly lineRenderer: RichTextLineRenderer;

  /** Creates a block-level rich-text scene node. */
  public constructor(input: {
    readonly block: { readonly id: RichTextBlockId; readonly index: number };
    readonly lines: readonly RichTextRenderLine[];
    readonly font: string;
    readonly rect: PositionRectProps;
    readonly origin?: Pick<PositionRectProps, 'x' | 'y'>;
    readonly lineRenderer: RichTextLineRenderer;
  }) {
    super({
      rect: input.rect,
      nodeKey: input.block.id,
      renderRole: 'block',
      semanticRole: 'block',
      depth: 1,
      blockId: input.block.id,
      blockIndex: input.block.index,
    });
    const blockTop = input.rect.y - (input.origin?.y ?? 0);
    // Keep line coordinates local to the block. Retained nodes can then move
    // with an updated positionRect without carrying stale document-space y's.
    this.lines = input.lines.map((line) => ({ ...line, y: line.y - blockTop }));
    this.font = input.font;
    this.lineRenderer = input.lineRenderer;
  }

  /** Draws all visible text runs inside this block. */
  public drawScene(context: RenderContext, clipRegion?: ClipRegion): void {
    // debugger;
    context.save();
    applyClip(context, clipRegion);
    const origin = { x: this.positionRect.x, y: this.positionRect.y };
    for (const line of this.lines) {
      this.lineRenderer.paint(context, { line, origin, font: this.font });
    }
    context.restore();
  }
}
