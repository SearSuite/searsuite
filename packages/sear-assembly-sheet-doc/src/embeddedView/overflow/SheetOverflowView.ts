import type { SheetDocument, SheetRenderUpdate } from '@searsuite/sear-sheet-editor-contract';
import type { SheetEmbeddedEditorView, SheetEmbeddedEditorViewContext } from '../SheetEmbeddedEditorView';

/** Keeps overflow sizing as a Sheet concern and requests geometry redraws. */
export class SheetOverflowView implements SheetEmbeddedEditorView {
  public readonly key = 'sheet.overflow';
  #contentSize: { width: number; height: number } | null = null;
  #invalidatedKey: string | null = null;

  public onRender(update: SheetRenderUpdate, context: SheetEmbeddedEditorViewContext): void {
    this.#contentSize = update.contentSize ? { ...update.contentSize } : null;
    const width = update.contentSize?.width ?? 0;
    if (width <= context.editor.geometry.cellRect.width) return;
    const cell = context.editor.geometry.cellRect;
    const invalidationKey = `${cell.x}:${cell.y}:${cell.width}:${cell.height}:${update.contentSize?.width ?? 0}:${
      update.contentSize?.height ?? 0
    }`;
    if (this.#invalidatedKey === invalidationKey) return;
    this.#invalidatedKey = invalidationKey;
    context.editor.invalidate?.({
      kind: 'geometry',
      rects: [context.editor.geometry.cellRect],
      reason: 'sheet-embedded-doc:overflow',
    });
  }

  public getContentSize(): { readonly width: number; readonly height: number } | null {
    return this.#contentSize ? { ...this.#contentSize } : null;
  }

  public onCommit(_document: SheetDocument, _context: SheetEmbeddedEditorViewContext): void {
    this.#contentSize = null;
    this.#invalidatedKey = null;
  }

  public dispose(): void {
    this.#contentSize = null;
    this.#invalidatedKey = null;
  }
}
