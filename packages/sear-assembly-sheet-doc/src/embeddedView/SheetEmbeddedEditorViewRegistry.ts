import { SearError } from '@searsuite/sear-foundation-error';
import type { SheetDocument, SheetRenderUpdate } from '@searsuite/sear-sheet-editor-contract';
import type { SheetEmbeddedEditorView, SheetEmbeddedEditorViewContext } from './SheetEmbeddedEditorView';

/** Owns the adapter's independent presentation contributions. */
export class SheetEmbeddedEditorViewRegistry {
  readonly #views = new Map<string, SheetEmbeddedEditorView>();
  #assertWrite: (() => void) | undefined;
  #teardownToken: object | undefined;

  public enforceWriteBoundary(assertWrite: () => void, teardownToken: object): void {
    if (this.#assertWrite) throw new SearError('Embedded view boundary is already installed.');
    this.#assertWrite = assertWrite;
    this.#teardownToken = teardownToken;
    Object.freeze(this);
  }

  public register(view: SheetEmbeddedEditorView): void {
    this.#assertWrite?.();
    if (this.#views.has(view.key)) throw new SearError(`Embedded view ${view.key} already exists.`);
    this.#views.set(
      view.key,
      Object.freeze({
        key: view.key,
        ...(view.initialize ? { initialize: view.initialize.bind(view) } : {}),
        ...(view.onRender ? { onRender: view.onRender.bind(view) } : {}),
        ...(view.onCommit ? { onCommit: view.onCommit.bind(view) } : {}),
        ...(view.onCancel ? { onCancel: view.onCancel.bind(view) } : {}),
        ...(view.dispose ? { dispose: view.dispose.bind(view) } : {}),
      }),
    );
  }

  public initialize(context: SheetEmbeddedEditorViewContext): void {
    this.#assertWrite?.();
    try {
      this.#views.forEach((view) => view.initialize?.(context));
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  public notifyRender(update: SheetRenderUpdate, context: SheetEmbeddedEditorViewContext): void {
    this.#views.forEach((view) => view.onRender?.(update, context));
  }

  public notifyCommit(document: SheetDocument, context: SheetEmbeddedEditorViewContext): void {
    this.#assertWrite?.();
    this.#views.forEach((view) => view.onCommit?.(document, context));
  }

  public notifyCancel(context: SheetEmbeddedEditorViewContext): void {
    this.#assertWrite?.();
    this.#views.forEach((view) => view.onCancel?.(context));
  }

  public dispose(ownerToken?: object): void {
    if (this.#assertWrite && ownerToken !== this.#teardownToken) this.#assertWrite();
    for (const view of [...this.#views.values()].reverse()) view.dispose?.();
    this.#views.clear();
  }
}
