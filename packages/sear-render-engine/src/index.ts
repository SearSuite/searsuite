/**
 * Frame scheduling, dirty-region coordination, and Sheet render orchestration.
 *
 * @packageDocumentation
 */

/**
 * @referenceChapter 0 data-to-frame From owner state to a frame
 * @referenceBody
 * `DataEngine` publishes typed field projections from state-owning features. `SheetRenderEngine` consumes the selected
 * projections, tracks dirty regions, and schedules a frame. Render nodes and strategies turn those values into draw
 * operations on a `RenderContext`; the host supplies the concrete drawing adapter.
 *
 * A command changes owner state first. After commit, the relevant projection and dirty region determine what is
 * repainted. Rendering a value does not make it durable document state: formula results, layout caches, and viewport
 * data may be derived or local to one editor session.
 */

/**
 * @referenceChapter 1 host-boundary Choose render and input adapters
 * @referenceBody
 * A visual editor needs a render context, text shaping, input, and viewport adapters compatible with its host.
 * `RenderContextFactory` helps the assembly obtain the chosen context; Canvas, SVG, and other concrete adapters stay
 * outside the portable domain model. A headless editor can omit visual services.
 *
 * **Use when:** building a visual host or contributing a rendering feature. Register the feature's data field or visual
 * reader at its owner, then consume that projection in the render layer. Host event handlers should request edits
 * through commands rather than changing render data directly.
 */

export { RenderContextFactory } from './RenderContextFactory';

export {
  DataEngine,
  DataViewFieldDuplicateError,
  type DataEngineRegistrationOptions,
  type DataEngineViewFieldSelector,
  type DataEngineViewFieldRegistration,
} from './DataEngine';
export { SheetDataEngine } from './SheetDataEngine';
export { type SheetDataPluginState, SheetDataPlugin } from './sheetPlugin/data/SheetDataPlugin';
export {
  readSheetColumnHiddenOriginalSizes,
  readSheetColumnSizes,
  readSheetRowHiddenOriginalSizes,
  readSheetRowSizes,
  readSheetRawRowSizes,
  SheetColumnHiddenOriginalSizesFieldKey,
  SheetColumnSizesFieldKey,
  SheetRowHiddenOriginalSizesFieldKey,
  SheetRowSizesFieldKey,
} from './SheetResizeDataFields';
export { SheetRowVisibilityFieldKey, readSheetRowVisibility, type SheetRowVisibility, VisibleRowDimensions } from './SheetRowVisibility';
export { readSheetDataMatrix, SheetDataMatrixFieldKey } from './sheetPlugin/data/SheetDataMatrixField';
export { ReadSheetCellDataQuery } from './sheetPlugin/data/ReadSheetCellDataQuery';
export { type SheetCellDataReader } from './sheetPlugin/data/SheetCellDataReader';
export { type SheetDataQueryRegistry } from './sheetPlugin/data/SheetDataQueryRegistry';
export { registerReadSheetCellDataQuery } from './sheetPlugin/data/registerReadSheetCellDataQuery';
export { SheetDataFieldNamespace } from './SheetDataView';
export { createInvertibleProjectedOperations, readDenseColumn, readDenseRow } from './SheetMatrixProjectionOperations';

export { RenderEngine } from './RenderEngine';
export { SheetMatrix, type CellMatrixElement } from './SheetMatrices';
export { DocRenderEngine, type DocRenderViewport } from './DocRenderEngine';
export { SheetRenderEngine } from './SheetRenderEngine';
