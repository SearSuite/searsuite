import type {
  SheetDocument,
  SheetEmbeddedEditorContext,
  SheetRenderUpdate,
} from '@searsuite/sear-sheet-editor-contract';

/** Presentation services owned by the Sheet-to-Doc adapter. */
export interface SheetEmbeddedEditorViewContext {
  readonly editor: SheetEmbeddedEditorContext;
  readonly document: SheetDocument;
}

/** Geometry and render lifecycle selected separately from editing policies. */
export interface SheetEmbeddedEditorView {
  readonly key: string;
  initialize?(context: SheetEmbeddedEditorViewContext): void;
  onRender?(update: SheetRenderUpdate, context: SheetEmbeddedEditorViewContext): void;
  onCommit?(document: SheetDocument, context: SheetEmbeddedEditorViewContext): void;
  onCancel?(context: SheetEmbeddedEditorViewContext): void;
  dispose?(): void;
}

/** Constructor selected by the adapter's presentation composition. */
export interface SheetEmbeddedEditorViewImplementation {
  new (): SheetEmbeddedEditorView;
}
