import type {
  SheetCompositionState,
  SheetCursorState,
  SheetEditorInvalidation,
  SheetEmbeddedEditorContext,
  SheetRenderUpdate,
} from '@searsuite/sear-sheet-editor-contract';
import type { SheetTextSelection } from '@searsuite/sear-assembly-doc';

export function createSheetUpdate(
  context: SheetEmbeddedEditorContext,
  kind: SheetEditorInvalidation['kind'],
  selection?: SheetTextSelection,
  cursor?: SheetCursorState | null,
  composition?: SheetCompositionState | null,
  contentSize?: { readonly width: number; readonly height: number },
): SheetRenderUpdate {
  const invalidation: SheetEditorInvalidation = {
    kind,
    rects: [context.geometry.cellRect],
    reason: `sheet-embedded-doc:${kind}`,
  };
  context.invalidate?.(invalidation);
  return {
    needsRedraw: true,
    invalidation,
    ...(selection ? { selection } : {}),
    ...(cursor ? { cursor } : {}),
    ...(composition ? { composition } : {}),
    ...(contentSize ? { contentSize } : {}),
  };
}
