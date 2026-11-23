/**
 * Merged-range state, structural transforms, commands, rendering, and persistence.
 *
 * @packageDocumentation
 */

export { CellMergeMatrix, type CellMergeMatrixData, type SheetCellMerge } from './CellMergeMatrix';
export {
  MergeCellsCommand,
  AnalyzeMergeCellsQuery,
  ToggleMergeCellsCommand,
  UnmergeCellsCommand,
  createMergeCellsOperations,
  createUnmergeCellsOperations,
  registerSheetCellMergeCommands,
  registerSheetCellMergeQueries,
  analyzeMergeCells,
  type SheetMergeAnalysis,
  type SheetMergeInput,
  type SheetCellMergeContentSource,
  type SheetCellMergeActionDataSource,
  type SheetCellMergeCommandDataSource,
} from './sheetPlugin/cellMerge/SheetCellMergeCommands';
export { SheetCellMergeConfirmationError } from './sheetPlugin/cellMerge/SheetCellMergeConfirmationError';
export { SheetCellMergePlugin, type SheetCellMergePluginState } from './sheetPlugin/cellMerge/SheetCellMergePlugin';
export { readSheetCellMerges, SheetCellMergeFieldKey } from './sheetPlugin/cellMerge/SheetCellMergeDataField';
export { SheetMergeRangeMoveError } from './SheetMergeRangeMoveError';
export { SheetMergeStructureMoveError } from './SheetMergeStructureMoveError';
