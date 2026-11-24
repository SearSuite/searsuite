import { type RichTextInlineStyle } from '@searsuite/sear-domain-doc';
import { type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { RenderContext } from '@searsuite/sear-render-context';

import { type ClipRegion } from './Node';
import { type RichTextRenderNodeProperties } from './RichTextRenderNodeTypes';
import { applyClip } from './RichTextRenderNodeUtils';
import { RichTextVisualNode } from './RichTextVisualNode';
import { RichTextRunRenderer } from './RichTextRunRenderer';

/** Scene node that draws one contiguous styled rich-text run in world coordinates. */
export class RichTextRunNode extends RichTextVisualNode {
  readonly #text: string;
  readonly #baselineY: number;
  readonly #font: string;
  readonly #fontAscent: number;
  readonly #fontDescent: number;
  readonly #textStyle: RichTextInlineStyle | undefined;
  readonly #runRenderer: RichTextRunRenderer;

  /** Creates a text-run scene node. */
  public constructor(input: {
    readonly text: string;
    readonly baselineY: number;
    readonly font: string;
    readonly fontAscent: number;
    readonly fontDescent: number;
    readonly style?: RichTextInlineStyle | undefined;
    readonly runRenderer: RichTextRunRenderer;
    readonly rect: PositionRectProps;
    readonly properties: Partial<RichTextRenderNodeProperties>;
  }) {
    super({
      rect: input.rect,
      nodeKey: input.properties.nodeKey ?? input.text,
      renderRole: 'text-run',
      semanticRole: 'text-run',
      depth: input.properties.depth ?? 1,
      isEdit: input.properties.isEdit,
      blockId: input.properties.blockId,
      blockIndex: input.properties.blockIndex,
    });
    Object.assign(this.properties, input.properties);
    this.#text = input.text;
    this.#baselineY = input.baselineY;
    this.#font = input.font;
    this.#fontAscent = input.fontAscent;
    this.#fontDescent = input.fontDescent;
    this.#textStyle = input.style;
    this.#runRenderer = input.runRenderer;
  }

  /** Draws the text run into the active world-space transform. */
  public drawScene(context: RenderContext, clipRegion?: ClipRegion): void {
    if (!this.#text) return;
    context.save();
    applyClip(context, clipRegion);
    this.#runRenderer.paint(context, {
      text: this.#text,
      style: this.#textStyle,
      font: this.#font,
      x: this.x,
      baselineY: this.#baselineY,
      width: this.width,
      height: this.height,
      fontAscent: this.#fontAscent,
      fontDescent: this.#fontDescent,
    });
    context.restore();
  }
}
