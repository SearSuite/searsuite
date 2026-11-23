/**
 * The default Doc-backed rich-text editor adapter for Sheet cells.
 *
 * @packageDocumentation
 */

export { SearCoreEditorAdapter } from './SearCoreEditorAdapter';
export {
  registerSheetEmbeddedInlineStyleObservation,
  type SheetEmbeddedInlineStyleObservationController,
} from './SheetEmbeddedInlineStyleObservations';
export { createSheetEmbeddedSearCoreEditor } from './createSheetEmbeddedSearCoreEditor';
export { defaultEmbeddedDocConfig } from './embeddedDocConfig';
export type { EmbeddedDocConfig, SearCoreEditorAdapterOptions } from './SearCoreEditorAdapterOptions';
export {
  SheetEmbeddedEditorPluginRegistry,
  type SheetEmbeddedEditorPlugin,
  type SheetEmbeddedEditorPluginImplementation,
  type SheetEmbeddedEditorPluginContext,
} from './adapterPlugin/embeddedEditor/SheetEmbeddedEditorPlugin';
export { SheetCellContextPlugin } from './adapterPlugin/cellContext/SheetCellContextPlugin';
export { SheetDocIntegrationPlugin } from './adapterPlugin/interop/SheetDocIntegrationPlugin';
export { SheetOverflowPlugin } from './adapterPlugin/overflow/SheetOverflowPlugin';
export { SheetClipboardPlugin } from './adapterPlugin/clipboard/SheetClipboardPlugin';
export { SheetFormulaReferencePlugin } from './adapterPlugin/formulaReference/SheetFormulaReferencePlugin';
export { SheetShortcutPlugin } from './adapterPlugin/shortcut/SheetShortcutPlugin';
