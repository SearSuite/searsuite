/**
 * Cell number-format state, commands, display projection, and persistence.
 *
 * @packageDocumentation
 */

export { CellFormatMatrix } from './CellFormatMatrix';
export { CellFormatMatrixError } from './CellFormatMatrixError';
export { SheetCellFormatPlugin } from './sheetPlugin/cellFormat/SheetCellFormatPlugin';
export { type SheetCellFormatPluginState } from './sheetPlugin/cellFormat/SheetCellFormatPluginState';
export {
  AdjustRangeCellFormatDecimalPlacesCommand,
  SetRangeCellFormatCommand,
  createAdjustCellFormatDecimalOperations,
  createSetRangeCellFormatOperations,
  registerSheetCellFormatCommand,
  type SheetCellFormatCommandDataSource,
  type SheetAdjustRangeCellFormatDecimalsInput,
  type SheetSetRangeCellFormatInput,
} from './sheetPlugin/cellFormat/SheetCellFormatCommands';
export { readSheetCellFormats, SheetCellFormatFieldKey } from './sheetPlugin/cellFormat/SheetCellFormatDataField';
export { ReadSheetCellFormatQuery } from './sheetPlugin/cellFormat/ReadSheetCellFormatQuery';
export { type SheetCellFormatReader } from './sheetPlugin/cellFormat/SheetCellFormatReader';
