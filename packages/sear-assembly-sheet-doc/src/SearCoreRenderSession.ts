import { SearError } from '@searsuite/sear-foundation-error';
import type { SheetRenderSession } from '@searsuite/sear-sheet-editor-contract';
import type {
  SheetEmbeddedEditorContext,
  SheetPointerHit,
  SheetPointerInput,
  SheetRenderUpdate,
} from '@searsuite/sear-sheet-editor-contract';
import { createFontDescriptor } from '@searsuite/sear-render-metrics';
import { toDocSelection } from './DocumentBoundary';
import { lockSheetDocumentSnapshot } from './DocumentSnapshotBoundary';
import { SearCoreEditorRuntime } from './SearCoreEditorRuntime';

/** Render-only session backed by the adapter's shared SearCoreDoc. */
export class SearCoreRenderSession implements SheetRenderSession {
  #disposed = false;
  readonly #runtime: SearCoreEditorRuntime;
  readonly #context: SheetEmbeddedEditorContext;
  readonly #document: Parameters<SearCoreEditorRuntime['draw']>[1];
  readonly #onDispose: () => void;

  public constructor(
    runtime: SearCoreEditorRuntime,
    context: SheetEmbeddedEditorContext,
    document: Parameters<SearCoreEditorRuntime['draw']>[1],
    onDispose: () => void,
  ) {
    this.#runtime = runtime;
    this.#context = context;
    this.#document = lockSheetDocumentSnapshot(document);
    this.#onDispose = onDispose;
  }

  public render(renderContext = this.#context.renderContext): SheetRenderUpdate {
    this.#assertLive();
    const selection = toDocSelection({
      anchor: { path: [0, 0], offset: 0 },
      head: { path: [0, 0], offset: 0 },
    });
    const prepared = this.#runtime.draw(
      this.#context,
      this.#document,
      selection,
      renderContext,
      this.#context.geometry.clipRect,
    );
    const update = {
      needsRedraw: false,
      contentSize: { width: prepared.positionRect.width, height: prepared.positionRect.height },
    };
    this.#runtime.sheetViews.notifyRender(update, this.#runtime.viewContext(this.#context, this.#document));
    return update;
  }

  public hitTest(input: SheetPointerInput): SheetPointerHit | null {
    this.#assertLive();
    const contains =
      this.#context.geometry.containsPoint?.(input.point) ?? containsRect(input.point, this.#context.geometry.cellRect);
    if (!contains) return { target: 'outside' };
    const point = this.#context.geometry.toLocalPoint(input.point);
    const selection = toDocSelection({
      anchor: { path: [0, 0], offset: 0 },
      head: { path: [0, 0], offset: 0 },
    });
    const prepared = this.#runtime.prepare(
      this.#context,
      this.#document,
      selection,
      false,
      this.#context.renderContext,
      createContextFont(this.#context, this.#runtime),
    );
    const position = this.#runtime.core.resolveCursorFromPoint(point.x, point.y, prepared.snapshot);
    return {
      target: hasText(this.#document) ? 'text' : 'empty',
      position: { path: position.path, offset: position.offset },
    };
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#onDispose();
  }

  #assertLive(): void {
    if (this.#disposed) throw new SearError('SearCoreEditorAdapter render session has been disposed.');
  }
}

function createContextFont(context: SheetEmbeddedEditorContext, runtime: SearCoreEditorRuntime): string {
  return createFontDescriptor({
    fontSize: context.defaultFontSize ?? runtime.fontSize,
    fontFamily: context.defaultFontFamily ?? runtime.fontFamily,
  });
}

function containsRect(
  point: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  return point.x >= rect.x && point.y >= rect.y && point.x <= rect.x + rect.width && point.y <= rect.y + rect.height;
}

function hasText(document: readonly { text?: string; content?: readonly unknown[] }[]): boolean {
  return document.some(
    (node) => typeof node.text === 'string' || node.content?.some((child) => hasText([child as never])),
  );
}
