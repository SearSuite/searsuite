import { type LayoutSnapshot } from '@searsuite/sear-domain-editor';
import { PositionRect, type PositionRectProps } from '@searsuite/sear-foundation-rect';
import { type HexColor } from '@searsuite/sear-foundation-utils';
import { RenderContext } from '@searsuite/sear-render-context';
import { ScrollManager } from '@searsuite/sear-render-scroll';
import {
  RichTextCaretNode,
  RichTextCompositionNode,
  RichTextContentNode,
  RichTextLineRenderer,
  RichTextSelectionNode,
} from '@searsuite/sear-render-node';
import { DocCursorManager } from './DocCursorManager';
import { type DocCompositionManager } from './DocCompositionManager';

/** Input for immediate rendering of laid-out document content lines. */
export interface DocImmediateRenderPainterContentInput {
  /** Layout snapshot whose lines are relative to the content origin. */
  readonly snapshot: LayoutSnapshot;
  /** Content origin in world coordinates. */
  readonly origin: Pick<PositionRectProps, 'x' | 'y'>;
  /** Base font selected by the host for this document frame. */
  readonly font?: string;
  /** Optional block indexes to draw; omitted means all blocks. */
  readonly blockIndexes?: readonly number[];
  /** Optional world-coordinate clipping rectangle. */
  readonly clipRect?: PositionRect<HexColor>;
}

/** Shared painter for embedded rich-document content and transient viewport output. */
export class DocImmediateRenderPainter {
  /** Creates a painter over the document cursor and scroll services. */
  public constructor(
    private readonly cursorManager: DocCursorManager,
    private readonly scrollManager: ScrollManager,
    private readonly lineRenderer: RichTextLineRenderer,
    private readonly compositionManager?: DocCompositionManager | null,
  ) {}

  /** Draws text lines from a layout snapshot in the caller's current transform. */
  public drawContent(context: RenderContext, input: DocImmediateRenderPainterContentInput): void {
    new RichTextContentNode({
      nodeKey: 'doc-immediate:content',
      rect: input.clipRect ?? createSnapshotRect(input.snapshot, input.origin),
      lines: input.snapshot.lines,
      origin: input.origin,
      ...(input.font ? { font: input.font } : {}),
      ...(input.blockIndexes ? { blockIndexes: input.blockIndexes } : {}),
      lineRenderer: this.lineRenderer,
    }).drawScene(context, input.clipRect);
  }

  /** Draws selection rectangles using the caller's current world transform. */
  public drawSelectionRectsInWorld(context: RenderContext): void {
    const rects = this.cursorManager.getSelectionRects();
    new RichTextSelectionNode({
      nodeKey: 'doc-immediate:selection',
      rect: createSelectionRect(rects),
      rects,
    }).drawScene(context);
  }

  /** Draws selection rectangles in viewport coordinates under an identity transform. */
  public drawSelectionRectsInViewport(context: RenderContext): void {
    const rects = this.cursorManager.getSelectionRects();
    const scroll = this.scrollManager.getState();
    new RichTextSelectionNode({
      nodeKey: 'doc-immediate:selection',
      rect: createSelectionRect(rects),
      rects,
      offset: { x: -scroll.x, y: -scroll.y },
      viewportOverlay: true,
    }).drawScene(context);
  }

  /** Draws IME composing text and caret in viewport coordinates. */
  public drawTextCursorOverlayInViewport(context: RenderContext): void {
    const cursorInfo = this.cursorManager.getCursor();
    if (cursorInfo) {
      const scroll = this.scrollManager.getState();
      new RichTextCompositionNode({
        nodeKey: 'doc-immediate:composition',
        rect: createCursorRect(cursorInfo.x, cursorInfo.y, cursorInfo.height || 10, scroll),
        text: this.compositionManager?.getText() ?? '',
        anchor: { x: cursorInfo.x, y: cursorInfo.y, height: cursorInfo.height || 10 },
        scroll,
        viewportOverlay: true,
      }).drawScene(context);
    }

    const composingCaretPixelOffset = this.compositionManager?.getCaretPixelOffset() ?? 0;
    if (cursorInfo?.visible) {
      const scroll = this.scrollManager.getState();
      new RichTextCaretNode({
        nodeKey: 'doc-immediate:caret',
        rect: createCursorRect(cursorInfo.x, cursorInfo.y, cursorInfo.height || 10, scroll),
        caret: {
          x: cursorInfo.x,
          y: cursorInfo.y,
          height: cursorInfo.height || 10,
          visible: cursorInfo.visible,
          pixelOffset: composingCaretPixelOffset,
        },
        scroll,
        viewportOverlay: true,
      }).drawScene(context);
    }
  }
}

function createSnapshotRect(
  snapshot: LayoutSnapshot,
  origin: Pick<PositionRectProps, 'x' | 'y'>,
): PositionRect<HexColor> {
  const maxRight = snapshot.lines.reduce((right, line) => {
    const width = line.chars.reduce((sum, char) => sum + char.width, 0);
    return Math.max(right, origin.x + line.x + width);
  }, origin.x);
  const maxBottom = snapshot.lines.reduce((bottom, line) => Math.max(bottom, origin.y + line.y + line.height), origin.y);
  return new PositionRect(origin.x, origin.y, Math.max(0, maxRight - origin.x), Math.max(0, maxBottom - origin.y));
}

function createSelectionRect(
  rects: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[],
): PositionRect<HexColor> {
  if (rects.length === 0) return new PositionRect(0, 0, 0, 0);
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return new PositionRect(left, top, right - left, bottom - top);
}

function createCursorRect(
  x: number,
  y: number,
  height: number,
  scroll: { readonly x: number; readonly y: number },
): PositionRect<HexColor> {
  return new PositionRect(x - scroll.x, y - scroll.y - height, 2, height * 2);
}
