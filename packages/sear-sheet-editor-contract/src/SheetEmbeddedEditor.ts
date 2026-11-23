import type {
  SheetEditInput,
  SheetDocumentNode,
  SheetEmbeddedEditorContext,
  SheetInlineStyleUpdate,
  SheetPointerInput,
  SheetPointerHit,
  SheetRenderUpdate,
  SheetCompositionState,
  SheetCursorState,
  SheetTextSelection,
} from './SheetEditorTypes';
import type { RenderContext } from '@searsuite/sear-render-context';
import type { ObservationRegistry } from '@searsuite/sear-foundation-subscription';

/** Per-frame options for painting an active Sheet edit session. */
export interface SheetEditRenderOptions {
  /** Whether the caret should be painted during this frame. */
  readonly cursorVisible?: boolean | undefined;
}

/** A retained render session for one Sheet cell document. */
export interface SheetRenderSession {
  /** Paints the current document into the supplied render target. */
  render(renderContext?: RenderContext): SheetRenderUpdate;
  hitTest(input: SheetPointerInput): SheetPointerHit | null;
  dispose(): void;
}

/** An active editing session for one Sheet cell document. */
export interface SheetEditSession {
  getDocument(): readonly SheetDocumentNode[];
  getSelection(): SheetTextSelection | null;
  getCursor(): SheetCursorState | null;
  getComposition(): SheetCompositionState | null;
  /** Paints the current edited document, selection, cursor and composition. */
  render(renderContext?: RenderContext, options?: SheetEditRenderOptions): SheetRenderUpdate;
  handleInput(input: SheetEditInput): SheetRenderUpdate;
  handlePointer(input: SheetPointerInput): SheetRenderUpdate;
  setSelection(selection: SheetTextSelection): SheetRenderUpdate;
  setInlineStyle(update: SheetInlineStyleUpdate): SheetRenderUpdate;
  commit(): readonly SheetDocumentNode[];
  cancel(): void;
  dispose(): void;
}

/**
 * Stable Sheet-facing embedded editor contract. Implementations own rich-text
 * layout, painting, selection, cursor and IME behavior behind this boundary.
 */
export interface SheetEmbeddedEditor {
  /** Typed editor-local state and event observations exposed to the host. */
  readonly observations: ObservationRegistry;
  /** Pure formatting projection; applying it returns a new snapshot without changing editor state. */
  readonly formatting?: {
    capture(document: readonly SheetDocumentNode[]): Readonly<Record<string, unknown>>;
    apply(document: readonly SheetDocumentNode[], format: Readonly<Record<string, unknown>>): SheetDocumentNode[];
  };
  /** Measures persisted rich text with its actual inline styles, without changing the edit session. */
  measureUnwrapped?(document: readonly SheetDocumentNode[], font: string): { width: number; height: number };
  initialize(context: SheetEmbeddedEditorContext): void;
  createRenderSession(context: SheetEmbeddedEditorContext): SheetRenderSession;
  createEditSession(context: SheetEmbeddedEditorContext): SheetEditSession;
  /** Restricts runtime teardown to the owning Sheet editor when supported. */
  bindTeardownToken?(token: object): void;
  dispose(ownerToken?: object): void;
}

/** Static DI token for the Sheet-facing editor abstraction. */
export namespace SheetEmbeddedEditor {
  export const symbol: symbol = Symbol.for('SheetEmbeddedEditor');
}
