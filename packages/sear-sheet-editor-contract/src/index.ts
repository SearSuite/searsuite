/**
 * Sheet-facing embedded rich-text editor contracts and test fakes without Doc-runtime dependencies.
 *
 * @packageDocumentation
 */

export { SheetEmbeddedEditor } from './SheetEmbeddedEditor';
export type { SheetEditRenderOptions, SheetEditSession, SheetRenderSession } from './SheetEmbeddedEditor';
export {
  SheetEmbeddedEditHistoryObservation,
  SheetEmbeddedInlineStyleObservation,
} from './SheetEmbeddedEditorObservations';
export type {
  SheetEmbeddedEditHistoryState,
  SheetEmbeddedInlineStyleState,
  SheetEmbeddedInlineStyleStatus,
} from './SheetEmbeddedEditorObservations';
export { FakeSheetEmbeddedEditor } from './FakeSheetEmbeddedEditor';
export type {
  SheetCompositionState,
  SheetCursorState,
  SheetDocument,
  SheetDocumentAccessor,
  SheetDocumentNode,
  SheetEditorGeometry,
  SheetEditorInvalidation,
  SheetEditorPoint,
  SheetEditorRect,
  SheetEmbeddedEditorContext,
  SheetPointerHit,
  SheetPointerInput,
  SheetRenderUpdate,
} from './SheetEditorTypes';
