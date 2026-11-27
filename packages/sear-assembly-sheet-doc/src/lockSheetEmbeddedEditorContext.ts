import type { SheetEmbeddedEditorContext } from '@searsuite/sear-sheet-editor-contract';

/** Fixes the read-only host contract before Sheet-only plugins can retain it. */
export function lockSheetEmbeddedEditorContext(context: SheetEmbeddedEditorContext): SheetEmbeddedEditorContext {
  Object.freeze(context.geometry);
  Object.freeze(context.documentAccessor);
  return Object.freeze(context);
}
