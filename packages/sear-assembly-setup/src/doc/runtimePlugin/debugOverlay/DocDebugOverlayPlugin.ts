import { type DocRenderLayoutState } from '@searsuite/sear-assembly-core';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { Injectable } from '@searsuite/sear-foundation-di';
import { type RenderContext } from '@searsuite/sear-render-context';
import { ViewportOverlayNode, type Node, type NodeProperties } from '@searsuite/sear-render-node';
import { DocPlugin, type DocPluginRuntime, type DocPluginSetupContext } from '@searsuite/sear-assembly-doc';

const DOC_DEBUG_OVERLAY_COLORS = {
  blockBounds: 'rgba(0, 128, 255, 0.85)',
  changedBlock: 'rgba(220, 38, 38, 0.9)',
  shiftedBlock: 'rgba(217, 119, 6, 0.9)',
  reusedBlock: 'rgba(22, 163, 74, 0.9)',
  copySource: 'rgba(14, 165, 233, 0.9)',
  copyDestination: 'rgba(99, 102, 241, 0.9)',
  invalidRedraw: 'rgba(244, 63, 94, 0.9)',
} as const;

const DOC_DEBUG_OVERLAY_DASH = [4, 3];
const DOC_DEBUG_OVERLAY_SOLID: number[] = [];

/** Debug overlay for document block-level render bounds. */
@Injectable()
export class DocDebugOverlayPlugin extends DocPlugin<null> {
  /** DI token for resolving DocDebugOverlayPlugin. */
  public static readonly symbol = Symbol.for('DocDebugOverlayPlugin');

  private runtime: DocPluginRuntime | null = null;

  /** Creates a DocDebugOverlayPlugin instance. */
  public constructor() {
    super({ key: new PluginKey('DocDebugOverlay'), state: null });
  }

  public registerState() {
    return { key: this.key, state: null };
  }

  public apply(_state: null, _transaction: unknown): null {
    return null;
  }

  public getPluginConfig(): null {
    return null;
  }

  public render(): Node<NodeProperties>[] | null {
    const layout = this.runtime?.document.core.getDocRenderLayoutState();
    if (!layout || (layout.visibleBlocks.length === 0 && !layout.blockRender)) return null;
    return [
      new ViewportOverlayNode({
        nodeKey: `${this.key.key}:block-bounds`,
        rect: createVisibleWorldRect(layout),
        role: 'selection',
        depth: 10_030,
        drawOverlay: (context) => this.drawBlockBounds(context, layout),
      }),
    ];
  }

  public configure(context: DocPluginSetupContext): void {
    this.runtime = context.runtime;
  }

  public start(): void {
    // Debug overlay rendering is returned from render().
  }

  public onEditorDestroy(): void {
    this.assertRuntimeWriteAllowed();
    this.runtime = null;
  }

  private drawBlockBounds(context: RenderContext, layout: DocRenderLayoutState): void {
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.setStrokeStyle(DOC_DEBUG_OVERLAY_COLORS.blockBounds);
    context.setLineWidth(1);

    layout.visibleBlocks.forEach((block) => {
      const rect = toViewportRect(
        {
          x: layout.documentRect.x + block.rect.x,
          y: layout.documentRect.y + block.rect.y,
          width: layout.documentRect.width,
          height: Math.max(block.rect.height, block.flowHeight, 1),
        },
        layout,
      );
      context.beginPath();
      context.rect(rect.x, rect.y, rect.width, rect.height);
      context.stroke();
    });

    const blockRender = layout.blockRender;
    if (blockRender) {
      drawDebugRects(
        context,
        blockRender.changedBlocks.map((rect) => toViewportRect(rect, layout)),
        DOC_DEBUG_OVERLAY_COLORS.changedBlock,
      );
      drawDebugRects(
        context,
        blockRender.shiftedBlocks.map((rect) => toViewportRect(rect, layout)),
        DOC_DEBUG_OVERLAY_COLORS.shiftedBlock,
      );
      drawDebugRects(
        context,
        blockRender.reusedBlocks.map((rect) => toViewportRect(rect, layout)),
        DOC_DEBUG_OVERLAY_COLORS.reusedBlock,
      );
      drawDebugRects(
        context,
        blockRender.invalidRedrawRects.map((rect) => toViewportRect(rect, layout)),
        DOC_DEBUG_OVERLAY_COLORS.invalidRedraw,
        DOC_DEBUG_OVERLAY_DASH,
      );
      drawDebugRects(
        context,
        blockRender.rasterCopies.map((copy) => copy.source),
        DOC_DEBUG_OVERLAY_COLORS.copySource,
        DOC_DEBUG_OVERLAY_DASH,
      );
      drawDebugRects(
        context,
        blockRender.rasterCopies.map((copy) => copy.destination),
        DOC_DEBUG_OVERLAY_COLORS.copyDestination,
      );
    }

    context.restore();
  }
}

function drawDebugRects(
  context: RenderContext,
  rects: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[],
  strokeStyle: string,
  lineDash: readonly number[] = DOC_DEBUG_OVERLAY_SOLID,
): void {
  context.setStrokeStyle(strokeStyle);
  context.setLineDash([...lineDash]);
  rects.forEach((rect) => {
    context.beginPath();
    context.rect(rect.x, rect.y, rect.width, rect.height);
    context.stroke();
  });
  if (lineDash.length > 0) context.setLineDash(DOC_DEBUG_OVERLAY_SOLID);
}

function toViewportRect(
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  layout: DocRenderLayoutState,
) {
  return {
    x: rect.x - layout.scroll.x,
    y: rect.y - layout.scroll.y,
    width: rect.width,
    height: rect.height,
  };
}

function createVisibleWorldRect(layout: DocRenderLayoutState) {
  return {
    x: layout.scroll.x,
    y: layout.scroll.y,
    width: layout.viewport.width,
    height: layout.viewport.height,
  };
}
