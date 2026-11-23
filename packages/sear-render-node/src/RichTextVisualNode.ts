import { type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { RenderContext } from '@searsuite/sear-render-context';

import { Node } from './Node';
import {
  type RichTextBlockId,
  type RichTextRenderNodeProperties,
} from './RichTextRenderNodeTypes';

/** Shared construction options for visual-only rich-text render nodes. */
export interface RichTextVisualNodeInput {
  readonly nodeKey: string;
  readonly rect: PositionRectProps;
  readonly renderRole: NonNullable<RichTextRenderNodeProperties['renderRole']>;
  readonly semanticRole: string;
  readonly depth: number;
  readonly isEdit?: boolean | undefined;
  readonly blockId?: RichTextBlockId | undefined;
  readonly blockIndex?: number | undefined;
}

/** Base class for rich-text nodes that only draw pixels and do not own hit state. */
export abstract class RichTextVisualNode extends Node<RichTextRenderNodeProperties> {
  /** Creates a visual-only rich-text node with common metadata. */
  protected constructor(input: RichTextVisualNodeInput) {
    super(input.rect, {
      nodeKey: input.nodeKey,
      renderRole: input.renderRole,
      semanticOwner: 'rich-text',
      semanticRole: input.semanticRole,
      isEdit: input.isEdit,
      skipHit: true,
      depth: input.depth,
      ...(input.blockId ? { blockId: input.blockId } : {}),
      ...(input.blockIndex !== void 0 ? { blockIndex: input.blockIndex } : {}),
    });
  }

  /** Rich-text visual nodes are ignored by hit testing unless a subclass opts in. */
  public drawHit(_context: RenderContext): void {}

  /** Rich-text visual node pixels are cleared by strategy-owned dirty rectangles. */
  public clear(_context: RenderContext): void {}

  /** Starts a draw scope and optionally switches to viewport coordinates. */
  protected beginScene(context: RenderContext, viewportOverlay: boolean = false): void {
    context.save();
    if (viewportOverlay) context.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Ends a draw scope started with beginScene(). */
  protected endScene(context: RenderContext): void {
    context.restore();
  }

  /** Resolves scroll compensation for nodes that draw in viewport coordinates. */
  protected resolveViewportOffset(
    viewportOverlay: boolean,
    scroll: { readonly x: number; readonly y: number },
  ): { readonly x: number; readonly y: number } {
    return viewportOverlay ? { x: -scroll.x, y: -scroll.y } : { x: 0, y: 0 };
  }
}
