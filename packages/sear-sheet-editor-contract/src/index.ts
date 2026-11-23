/**
 * Sheet-facing embedded rich-text editor contracts and test fakes without Doc-runtime dependencies.
 *
 * @packageDocumentation
 */

export { SheetEmbeddedEditor } from './SheetEmbeddedEditor';
export type { SheetEditRenderOptions, SheetEditSession, SheetRenderSession } from './SheetEmbeddedEditor';
export { SheetEmbeddedEditHistoryObservation, SheetEmbeddedInlineStyleObservation } from './SheetEmbeddedEditorObservations';
export type { SheetEmbeddedEditHistoryState, SheetEmbeddedInlineStyleState, SheetEmbeddedInlineStyleStatus } from './SheetEmbeddedEditorObservations';
export { FakeSheetEmbeddedEditor } from './FakeSheetEmbeddedEditor';
export type {
  SheetCompositionInput,
  SheetCompositionState,
  SheetCursorState,
  SheetDeleteInput,
  SheetDocument,
  SheetDocumentAccessor,
  SheetDocumentNode,
  SheetEditorGeometry,
  SheetEditorInvalidation,
  SheetEditorPoint,
  SheetEditorRect,
  SheetEmbeddedEditorContext,
  SheetEditInput,
  SheetInlineStyleUpdate,
  SheetInputModifiers,
  SheetKeyInput,
  SheetPointerHit,
  SheetPointerInput,
  SheetRenderUpdate,
  SheetTextInput,
  SheetTextPosition,
  SheetTextSelection,
} from './SheetEditorTypes';
