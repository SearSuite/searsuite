import { type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { RenderContext } from '@searsuite/sear-render-context';

import { RichTextVisualNode } from './RichTextVisualNode';

/** Viewport overlay node that draws transient UI under an identity transform. */
export class ViewportOverlayNode extends RichTextVisualNode {
  readonly #drawOverlay: (context: RenderContext) => void;

  /** Creates a viewport overlay render node. */
  public constructor(input: {
    readonly nodeKey: string;
    readonly rect: PositionRectProps;
    readonly drawOverlay: (context: RenderContext) => void;
    readonly depth?: number;
    readonly role?: 'selection' | 'caret';
  }) {
    super({
      rect: input.rect,
      nodeKey: input.nodeKey,
      renderRole: input.role ?? 'selection',
      semanticRole: 'overlay',
      depth: input.depth ?? 10_000,
      isEdit: true,
    });
    this.#drawOverlay = input.drawOverlay;
  }

  /** Draws overlay content; the node owns transform isolation for viewport-space plugins. */
  public drawScene(context: RenderContext): void {
    this.beginScene(context, true);
    this.#drawOverlay(context);
    this.endScene(context);
  }
}
