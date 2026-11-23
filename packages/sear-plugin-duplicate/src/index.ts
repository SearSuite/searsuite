/**
 * Sparse Sheet duplicate-highlight state and duplicate row commands.
 *
 * @packageDocumentation
 */

export {
  DuplicateMatrix,
  type DuplicateMatrixData,
  type SheetDuplicateHighlight,
  assertSheetDuplicateHighlight,
  isSheetDuplicateHighlight,
} from './DuplicateMatrix';
export { SheetDuplicatePlugin, type SheetDuplicatePluginState } from './sheetPlugin/duplicate/SheetDuplicatePlugin';
export {
  HighlightDuplicateRowsCommand,
  ClearDuplicateHighlightsCommand,
  DeleteDuplicateRowsCommand,
  SheetDuplicateKeepMode,
  registerSheetDuplicateCommands,
  createHighlightDuplicateOperations,
  createClearDuplicateHighlightOperations,
  createDeleteDuplicateRowsOperations,
  type SheetDuplicateHighlightInput,
  type SheetDuplicateClearInput,
  type SheetDuplicateDeleteInput,
  type SheetDuplicateCommandDataSource,
} from './sheetPlugin/duplicate/SheetDuplicateCommands';
export { readSheetDuplicateHighlights, SheetDuplicateFieldKey } from './sheetPlugin/duplicate/SheetDuplicateDataField';
