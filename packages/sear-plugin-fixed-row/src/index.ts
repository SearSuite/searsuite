/**
 * Sparse fixed-row state, structural transforms, visual projection, collaboration, and export.
 *
 * @packageDocumentation
 */

export { FixedRowMatrix, type FixedRowMatrixData } from './FixedRowMatrix';
export {
  SetSheetRowsFixedCommand,
  createSetSheetRowsFixedOperations,
  registerSheetFixedRowCommands,
  type SheetFixedRowCommandDataSource,
  type SheetSetRowsFixedInput,
} from './sheetPlugin/fixedRow/SheetFixedRowCommands';
export { readSheetFixedRows, SheetFixedRowsFieldKey } from './sheetPlugin/fixedRow/SheetFixedRowDataField';
export { SheetFixedRowPlugin, type SheetFixedRowPluginState } from './sheetPlugin/fixedRow/SheetFixedRowPlugin';
