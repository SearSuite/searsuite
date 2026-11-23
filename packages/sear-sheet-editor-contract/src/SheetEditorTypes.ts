import type { Schema } from '@searsuite/sear-domain-doc-schema';
import type { RenderContext } from '@searsuite/sear-render-context';

/** A document node exchanged between a Sheet cell and an embedded editor. */
export type SheetDocumentNode = Schema;

/** A rich-document snapshot owned by the Sheet cell boundary. */
export type SheetDocument = readonly SheetDocumentNode[];

/** A point in Sheet or editor-local coordinates. */
export interface SheetEditorPoint {
  readonly x: number;
  readonly y: number;
}

/** A rectangle in Sheet or editor-local coordinates. */
export interface SheetEditorRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Cell geometry supplied by Sheet. The editor uses these functions for hit
 * testing and drawing without knowing how the Sheet viewport is implemented.
 */
export interface SheetEditorGeometry {
  readonly cellRect: SheetEditorRect;
  readonly clipRect?: SheetEditorRect | undefined;
  readonly toLocalPoint: (point: SheetEditorPoint) => SheetEditorPoint;
  readonly toSheetPoint: (point: SheetEditorPoint) => SheetEditorPoint;
  readonly containsPoint?: ((point: SheetEditorPoint) => boolean) | undefined;
}

/** Reads a cell document and commits a new document through the Sheet boundary. */
export interface SheetDocumentAccessor {
  read(): SheetDocument;
  commit(document: SheetDocument): void;
}

/** A position in the rich document represented by a node path and text offset. */
export interface SheetTextPosition {
  readonly path: readonly (number | string)[];
  readonly offset: number;
}

/** A text selection represented by anchor and head positions. */
export interface SheetTextSelection {
  readonly anchor: SheetTextPosition;
  readonly head: SheetTextPosition;
}

/** A cursor rectangle in editor-local coordinates. */
export interface SheetCursorState {
  readonly rect: SheetEditorRect;
  readonly visible?: boolean | undefined;
}

/** Current IME composition state in editor-local coordinates. */
export interface SheetCompositionState {
  readonly active: boolean;
  readonly text: string;
  readonly rect?: SheetEditorRect | undefined;
}

/** Result of pointer hit testing against the embedded document. */
export interface SheetPointerHit {
  readonly position?: SheetTextPosition | undefined;
  readonly selection?: SheetTextSelection | undefined;
  readonly target: 'text' | 'empty' | 'outside';
}

/** Modifier keys normalized by the Sheet host. */
export interface SheetInputModifiers {
  readonly shiftKey?: boolean | undefined;
  readonly metaKey?: boolean | undefined;
  readonly ctrlKey?: boolean | undefined;
  readonly altKey?: boolean | undefined;
}

/** Text insertion delivered by the Sheet input adapter. */
export interface SheetTextInput {
  readonly type: 'insertText';
  readonly text: string;
}

/** Text deletion delivered by the Sheet input adapter. */
export interface SheetDeleteInput {
  readonly type: 'deleteContent';
  readonly direction: 'backward' | 'forward';
  readonly count?: number | undefined;
}

/** IME composition lifecycle input delivered by the Sheet input adapter. */
export interface SheetCompositionInput {
  readonly type: 'compositionStart' | 'compositionUpdate' | 'compositionEnd';
  readonly text?: string | undefined;
}

/** Keyboard input that the embedded editor may consume for navigation or editing. */
export interface SheetKeyInput extends SheetInputModifiers {
  readonly type: 'keyDown';
  readonly key: string;
  readonly code?: string | undefined;
}

/** Input accepted by an active Sheet edit session. */
export type SheetEditInput = SheetTextInput | SheetDeleteInput | SheetCompositionInput | SheetKeyInput;

/** Pointer input normalized by the Sheet host. */
export interface SheetPointerInput extends SheetInputModifiers {
  readonly type: 'pointerDown' | 'pointerMove' | 'pointerUp';
  readonly point: SheetEditorPoint;
  readonly buttons?: number | undefined;
  readonly clickCount?: number | undefined;
}

/** An inline style patch applied to the active text selection. */
export interface SheetInlineStyleUpdate {
  readonly attrs: Readonly<Record<string, unknown>>;
}

/** A rectangle or semantic reason that should be redrawn by Sheet. */
export interface SheetEditorInvalidation {
  readonly kind: 'content' | 'selection' | 'cursor' | 'composition' | 'geometry' | 'all';
  readonly rects?: readonly SheetEditorRect[] | undefined;
  readonly reason?: string | undefined;
}

/** State returned after a render or edit operation. */
export interface SheetRenderUpdate {
  readonly needsRedraw: boolean;
  readonly invalidation?: SheetEditorInvalidation | undefined;
  readonly selection?: SheetTextSelection | undefined;
  readonly cursor?: SheetCursorState | undefined;
  readonly composition?: SheetCompositionState | undefined;
  readonly contentSize?: { readonly width: number; readonly height: number } | undefined;
}

/** Context in which a Sheet cell editor renders and edits one cell document. */
export interface SheetEmbeddedEditorContext {
  readonly renderContext: RenderContext;
  /** Present in assembled Sheets to require command dispatch for edit-session mutations. */
  readonly isCommandExecuting?: (() => boolean) | undefined;
  /** Host-selected default font size for read-only Sheet cell rendering. */
  readonly defaultFontSize?: number | undefined;
  /** Host-selected default font family for read-only Sheet cell rendering. */
  readonly defaultFontFamily?: string | undefined;
  readonly geometry: SheetEditorGeometry;
  readonly documentAccessor: SheetDocumentAccessor;
  readonly invalidate?: ((invalidation: SheetEditorInvalidation) => void) | undefined;
}
