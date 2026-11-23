import { type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { StandardColor } from '@searsuite/sear-foundation-utils';
import { RenderContext } from '@searsuite/sear-render-context';

import { RichTextVisualNode } from './RichTextVisualNode';

/** Scene node that draws active IME composing text and underline. */
export class RichTextCompositionNode extends RichTextVisualNode {
  private readonly text: string;
  private readonly anchor: { readonly x: number; readonly y: number; readonly height: number };
  private readonly scroll: { readonly x: number; readonly y: number };
  private readonly viewportOverlay: boolean;

  /** Creates an IME composition overlay node. */
  public constructor(input: {
    readonly nodeKey: string;
    readonly rect: PositionRectProps;
    readonly text: string;
    readonly anchor: { readonly x: number; readonly y: number; readonly height: number };
    readonly scroll?: { readonly x: number; readonly y: number };
    readonly viewportOverlay?: boolean | undefined;
    readonly depth?: number | undefined;
  }) {
    super({
      rect: input.rect,
      nodeKey: input.nodeKey,
      renderRole: 'composition',
      semanticRole: 'composition',
      depth: input.depth ?? 10_019,
      isEdit: true,
    });
    this.text = input.text;
    this.anchor = input.anchor;
    this.scroll = input.scroll ?? { x: 0, y: 0 };
    this.viewportOverlay = input.viewportOverlay === true;
  }

  /** Draws composing text in world or viewport coordinates. */
  public drawScene(context: RenderContext): void {
    if (!this.text) return;
    const metrics = context.measureText(this.text);
    const descent = metrics.fontDescent ?? this.anchor.height * 0.2;
    const offset = this.resolveViewportOffset(this.viewportOverlay, this.scroll);
    const x = this.anchor.x + offset.x;
    const y = this.anchor.y + offset.y;

    this.beginScene(context, this.viewportOverlay);
    context.setFillStyle(StandardColor.Black);
    context.fillText(this.text, x, y);
    context.setStrokeStyle(StandardColor.Black);
    context.setLineWidth(1);
    context.beginPath();
    context.moveTo(x, y + descent);
    context.lineTo(x + metrics.width, y + descent);
    context.stroke();
    this.endScene(context);
  }
}
