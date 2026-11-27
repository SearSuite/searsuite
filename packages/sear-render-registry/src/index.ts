/**
 * Editor-local registries that connect cell types and Sheet state to renderers.
 *
 * @packageDocumentation
 */

export { RenderCoordinatorManager } from './RenderCoordinatorManager';
export { SheetRenderCoordinatorManager } from './SheetRenderCoordinatorManager';
export { NodeFactory } from './NodeFactory';
export { SheetNodeFactory } from './SheetNodeFactory';
export { RendererRegistry } from './RendererRegistry';
export { SheetRendererRegistry } from './SheetRendererRegistry';
export { SheetCellVisualReaderRegistry } from './SheetCellVisualReaderRegistry';
export {
  type SheetCellVisualReadPosition,
  type SheetCellVisualReader,
  type SheetCellVisualReaderRegistrationContext,
  type SheetCellVisualOverride,
  type SheetCellVisualLayer,
  type SheetCellConditionalVisual,
  type SheetCellConditionalVisualReader,
} from './SheetCellVisualReader';
export { SheetCellVisualReaderError, SheetCellVisualReaderErrorCode } from './SheetCellVisualReaderError';
export { AffixCell } from './cell/AffixCell';
export { EmptyCell } from './cell/EmptyCell';
export { StringCell } from './cell/StringCell';
export { NumberCell } from './cell/NumberCell';
export { BooleanCell } from './cell/BooleanCell';
export { RichTextCell } from './cell/RichTextCell';

export { EditorCell } from './cell/EditorCell';
export { EmbeddedEditorRenderNode } from './cell/EmbeddedEditorRenderNode';
export { FormulaCell } from './cell/FormulaCell';

export {
  Cell,
  CellRegion,
  CellRenderType,
  type CellProperties,
  type CellContext,
  IFormulaResultProvider,
} from './Cell';

export { defineCellRenderer, type CellRendererDefinition } from './CellRendererDefinition';
