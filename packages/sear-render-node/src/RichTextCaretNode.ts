import { type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { StandardColor } from '@searsuite/sear-foundation-utils';
import { RenderContext } from '@searsuite/sear-render-context';

import { RichTextVisualNode } from './RichTextVisualNode';

/** Scene node that draws a rich-text caret. */
export class RichTextCaretNode extends RichTextVisualNode {
  private readonly caret: {
    readonly x: number;
    readonly y: number;
    readonly height: number;
    readonly visible: boolean;
    readonly pixelOffset: number;
  };
  private readonly scroll: { readonly x: number; readonly y: number };
  private readonly viewportOverlay: boolean;

  /** Creates a caret overlay node. */
  public constructor(input: {
    readonly nodeKey: string;
    readonly rect: PositionRectProps;
    readonly caret: {
      readonly x: number;
      readonly y: number;
      readonly height: number;
      readonly visible: boolean;
      readonly pixelOffset?: number | undefined;
    };
    readonly scroll?: { readonly x: number; readonly y: number };
    readonly viewportOverlay?: boolean | undefined;
    readonly depth?: number | undefined;
  }) {
    super({
      rect: input.rect,
      nodeKey: input.nodeKey,
      renderRole: 'caret',
      semanticRole: 'caret',
      depth: input.depth ?? 10_020,
      isEdit: true,
    });
    this.caret = {
      ...input.caret,
      pixelOffset: input.caret.pixelOffset ?? 0,
    };
    this.scroll = input.scroll ?? { x: 0, y: 0 };
    this.viewportOverlay = input.viewportOverlay === true;
  }

  /** Draws the caret when the blink state says it is visible. */
  public drawScene(context: RenderContext): void {
    if (!this.caret.visible) return;
    const metrics = context.measureText('|');
    const ascent = metrics.fontAscent ?? this.caret.height * 0.8;
    const descent = metrics.fontDescent ?? this.caret.height * 0.2;
    const snappedX = Math.round(this.caret.x + this.caret.pixelOffset);
    const top = this.caret.y - ascent;
    const bottom = this.caret.y + descent;
    const offset = this.resolveViewportOffset(this.viewportOverlay, this.scroll);

    this.beginScene(context, this.viewportOverlay);
    context.setStrokeStyle(StandardColor.Black);
    context.setLineWidth(2);
    context.beginPath();
    context.moveTo(snappedX + offset.x, top + offset.y);
    context.lineTo(snappedX + offset.x, bottom + offset.y);
    context.stroke();
    this.endScene(context);
  }
}
