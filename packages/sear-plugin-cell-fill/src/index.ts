/**
 * Sparse Sheet fill state, commands, visual projection, collaboration, and export.
 *
 * @packageDocumentation
 */

export {
  CellFillMatrix,
  type CellFillMatrixData,
  type SheetCellFill,
  assertSheetCellFill,
  isSheetCellFill,
} from './CellFillMatrix';
export { SheetCellFillPlugin, type SheetCellFillPluginState } from './sheetPlugin/cellFill/SheetCellFillPlugin';
export {
  SetRangeCellFillCommand,
  registerSheetCellFillCommand,
  createSetRangeCellFillOperations,
  type SheetSetRangeCellFillInput,
  type SheetCellFillCommandDataSource,
} from './sheetPlugin/cellFill/SheetCellFillCommands';
export { readSheetCellFills, SheetCellFillFieldKey } from './sheetPlugin/cellFill/SheetCellFillDataField';
