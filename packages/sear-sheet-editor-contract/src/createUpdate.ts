import type {
  SheetEmbeddedEditorContext,
  SheetEditorInvalidation,
  SheetRenderUpdate,
  SheetTextSelection,
} from './SheetEditorTypes';

/** Creates a deterministic render update and forwards its invalidation to Sheet. */
export function createUpdate(
  context: SheetEmbeddedEditorContext,
  reason: string,
  selection?: SheetTextSelection,
): SheetRenderUpdate {
  const invalidation: SheetEditorInvalidation = {
    kind: 'all',
    rects: [{ ...context.geometry.cellRect }],
    reason,
  };
  context.invalidate?.(invalidation);
  return {
    needsRedraw: true,
    invalidation,
    selection: selection ? {
      anchor: { path: [...selection.anchor.path], offset: selection.anchor.offset },
      head: { path: [...selection.head.path], offset: selection.head.offset },
    } : undefined,
  };
}
