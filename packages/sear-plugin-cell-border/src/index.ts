/**
 * Independent Sheet cell borders, commands, rendering, history and collaboration.
 * @packageDocumentation
 */
export { CellBorderMatrix, type CellBorderMatrixData } from './CellBorderMatrix';
export {
  SheetBorderPreset,
  SheetBorderSide,
  SheetBorderLineStyle,
  type SheetBorderStroke,
  type SheetCellBorder,
} from './SheetCellBorder';
export { CellBorderError } from './CellBorderValidation';
export { BorderLinePaint } from './BorderLinePaint';
export { SheetCellBorderPlugin, type SheetCellBorderPluginState } from './sheetPlugin/cellBorder/SheetCellBorderPlugin';
export { SetRangeCellBorderCommand, type SheetSetRangeCellBorderInput } from './SheetCellBorderCommands';
export { ReadSheetCellBorderQuery } from './SheetCellBorderQueries';
export { SheetCellBorderFieldKey, readSheetCellBorders } from './SheetCellBorderDataField';
