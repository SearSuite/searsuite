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
export * from './embeddedView/SheetEmbeddedEditorView';
export * from './embeddedView/SheetEmbeddedEditorViewRegistry';
export { SheetCellContextView } from './embeddedView/cellContext/SheetCellContextView';
export { SheetOverflowView } from './embeddedView/overflow/SheetOverflowView';
