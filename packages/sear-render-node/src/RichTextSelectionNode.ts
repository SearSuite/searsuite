import { PositionRect, type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { type HexColor } from '@searsuite/sear-foundation-utils';
import { RenderContext } from '@searsuite/sear-render-context';

import { type ClipRegion } from './Node';
import { applyClip } from './RichTextRenderNodeUtils';
import { RichTextVisualNode } from './RichTextVisualNode';

/** Rectangle highlighted as part of a rich-text selection. */
export interface RichTextSelectionRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Scene node that draws rich-text selection rectangles. */
export class RichTextSelectionNode extends RichTextVisualNode {
  readonly #rects: readonly RichTextSelectionRect[];
  readonly #offset: { readonly x: number; readonly y: number };
  readonly #viewportOverlay: boolean;

  /** Creates a selection overlay node. */
  public constructor(input: {
    readonly nodeKey: string;
    readonly rect: PositionRectProps;
    readonly rects: readonly RichTextSelectionRect[];
    readonly offset?: { readonly x: number; readonly y: number };
    readonly viewportOverlay?: boolean | undefined;
    readonly depth?: number | undefined;
  }) {
    super({
      rect: input.rect,
      nodeKey: input.nodeKey,
      renderRole: 'selection',
      semanticRole: 'selection',
      depth: input.depth ?? 10_010,
      isEdit: true,
    });
    this.#rects = input.rects;
    this.#offset = input.offset ?? { x: 0, y: 0 };
    this.#viewportOverlay = input.viewportOverlay === true;
  }

  /** Draws selection rectangles in world or viewport coordinates. */
  public drawScene(context: RenderContext, clipRegion?: ClipRegion): void {
    if (this.#rects.length === 0) return;
    this.beginScene(context, this.#viewportOverlay);
    applyClip(context, this.#resolveClipRegion(clipRegion));
    context.setFillStyle('rgba(173, 214, 255, 0.8)');
    for (const rect of this.#rects) this.#drawRect(context, rect);
    this.endScene(context);
  }

  /** World-space regions where text should be painted above the highlight. */
  public getSelectionRects(): readonly RichTextSelectionRect[] {
    return this.#rects;
  }

  #resolveClipRegion(clipRegion?: ClipRegion): ClipRegion | undefined {
    if (!clipRegion || !this.#viewportOverlay) return clipRegion;
    if (Array.isArray(clipRegion)) {
      return clipRegion.map(([x, y]) => [x + this.#offset.x, y + this.#offset.y] as [number, number]);
    }
    return new PositionRect<HexColor>(
      clipRegion.x + this.#offset.x,
      clipRegion.y + this.#offset.y,
      clipRegion.width,
      clipRegion.height,
    );
  }

  #drawRect(context: RenderContext, rect: RichTextSelectionRect): void {
    context.beginPath();
    context.rect(rect.x + this.#offset.x, rect.y + this.#offset.y, rect.width, rect.height);
    context.fill();
  }
}
