import { type Schema } from '@searsuite/sear-domain-doc-schema';
import { type SheetEditInput, type SheetInlineStyleUpdate } from '../input/DocEditInput';

/** Immutable document data available to embedded editing policies. */
export interface SheetEmbeddedEditorPluginContext {
  readonly document: readonly Schema[];
}

/** Semantic editing policy independent of its host, Core and presentation. */
export interface SheetEmbeddedEditorPlugin {
  readonly key: string;
  initialize?(context: SheetEmbeddedEditorPluginContext): void;
  transformInput?(input: SheetEditInput, context: SheetEmbeddedEditorPluginContext): SheetEditInput | null | void;
  transformInlineStyle?(
    update: SheetInlineStyleUpdate,
    context: SheetEmbeddedEditorPluginContext,
  ): SheetInlineStyleUpdate | null | void;
  transformCommit?(
    document: readonly Schema[],
    context: SheetEmbeddedEditorPluginContext,
  ): readonly Schema[] | null | void;
  onDocumentChanged?(context: SheetEmbeddedEditorPluginContext): void;
  onCommit?(document: readonly Schema[], context: SheetEmbeddedEditorPluginContext): void;
  onCancel?(context: SheetEmbeddedEditorPluginContext): void;
  dispose?(): void;
}

/** Constructor selected by the embedded editor composition. */
export interface SheetEmbeddedEditorPluginImplementation {
  new (): SheetEmbeddedEditorPlugin;
}
