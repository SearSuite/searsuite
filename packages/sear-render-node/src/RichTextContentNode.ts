import { type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { RenderContext } from '@searsuite/sear-render-context';

import { type ClipRegion } from './Node';
import {
  type RichTextRenderLine,
} from './RichTextRenderNodeTypes';
import { RichTextLineRenderer } from './RichTextLinePainter';
import { applyClip } from './RichTextRenderNodeUtils';
import { RichTextVisualNode } from './RichTextVisualNode';

/** Scene node that draws laid-out rich-text lines in world coordinates. */
export class RichTextContentNode extends RichTextVisualNode {
  private readonly lines: readonly RichTextRenderLine[];
  private readonly origin: Pick<PositionRectProps, 'x' | 'y'>;
  private readonly font: string | undefined;
  private readonly blockIndexes: ReadonlySet<number> | null;
  private readonly lineRenderer: RichTextLineRenderer;

  /** Creates a rich-text content node from pre-computed layout lines. */
  public constructor(input: {
    readonly nodeKey: string;
    readonly rect: PositionRectProps;
    readonly lines: readonly RichTextRenderLine[];
    readonly origin: Pick<PositionRectProps, 'x' | 'y'>;
    readonly font?: string | undefined;
    readonly blockIndexes?: readonly number[] | undefined;
    readonly depth?: number | undefined;
    readonly lineRenderer: RichTextLineRenderer;
  }) {
    super({
      rect: input.rect,
      nodeKey: input.nodeKey,
      renderRole: 'block',
      semanticRole: 'content',
      depth: input.depth ?? 1,
      isEdit: true,
    });
    this.lines = input.lines;
    this.origin = input.origin;
    this.font = input.font;
    this.blockIndexes = input.blockIndexes ? new Set(input.blockIndexes) : null;
    this.lineRenderer = input.lineRenderer;
  }

  /** Draws every included layout line inside this node's clip. */
  public drawScene(context: RenderContext, clipRegion?: ClipRegion): void {
    context.save();
    if (clipRegion) {
      applyClip(context, clipRegion);
    } else {
      context.beginPath();
      context.rect(this.positionRect.x, this.positionRect.y, this.positionRect.width, this.positionRect.height);
      context.clip();
    }
    for (const line of this.lines) this.drawIncludedLine(context, line);
    context.restore();
  }

  private drawIncludedLine(context: RenderContext, line: RichTextRenderLine): void {
    if (this.blockIndexes && !this.blockIndexes.has(line.textNodePath[0])) return;
    this.lineRenderer.paint(context, { line, origin: this.origin, font: this.font });
  }
}
