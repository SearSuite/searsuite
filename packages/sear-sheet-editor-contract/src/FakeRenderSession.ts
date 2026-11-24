import { SearError } from '@searsuite/sear-foundation-error';
import type { SheetRenderSession } from './SheetEmbeddedEditor';
import type {
  SheetEmbeddedEditorContext,
  SheetPointerHit,
  SheetPointerInput,
  SheetRenderUpdate,
} from './SheetEditorTypes';
import type { RenderContext } from '@searsuite/sear-render-context';

/** Deterministic render and hit-test session used by Sheet tests. */
export class FakeRenderSession implements SheetRenderSession {
  readonly #context: SheetEmbeddedEditorContext;

  #disposed = false;
  public renderCount = 0;
  public lastRenderContext: RenderContext | undefined;
  public disposeCount = 0;

  public constructor(context: SheetEmbeddedEditorContext) {
    this.#context = context;
  }

  public render(_renderContext?: RenderContext): SheetRenderUpdate {
    this.#assertLive();
    this.renderCount += 1;
    this.lastRenderContext = _renderContext;
    if (_renderContext) {
      const text = flattenText(this.#context.documentAccessor.read());
      if (text)
        _renderContext.fillText(text, this.#context.geometry.cellRect.x + 4, this.#context.geometry.cellRect.y + 16);
    }
    const invalidation = { kind: 'content' as const, rects: [{ ...this.#context.geometry.cellRect }], reason: 'render' };
    return { needsRedraw: true, invalidation };
  }

  public hitTest(input: SheetPointerInput): SheetPointerHit | null {
    this.#assertLive();
    const point = this.#context.geometry.toLocalPoint(input.point);
    const contains =
      this.#context.geometry.containsPoint?.(input.point) ??
      (point.x >= 0 &&
        point.y >= 0 &&
        point.x <= this.#context.geometry.cellRect.width &&
        point.y <= this.#context.geometry.cellRect.height);
    if (!contains) return { target: 'outside' };
    return { target: 'text', position: { path: [0, 0], offset: 0 } };
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.disposeCount += 1;
  }

  #assertLive(): void {
    if (this.#disposed) throw new SearError('FakeSheetEmbeddedEditor render session has been disposed.');
  }
}

function flattenText(nodes: readonly { readonly text?: string; readonly content?: readonly unknown[] }[]): string {
  return nodes
    .map((node) => (typeof node.text === 'string' ? node.text : flattenText((node.content ?? []) as never)))
    .join('');
}
