/**
 * Sheet horizontal and vertical alignment state, commands, rendering projections, and persistence.
 *
 * @packageDocumentation
 */

export { SheetAlignmentPlugin, type SheetAlignmentPluginState } from './sheetPlugin/alignment/SheetAlignmentPlugin';
export {
  SheetVerticalAlignmentPlugin,
  type SheetVerticalAlignmentPluginState,
} from './sheetPlugin/verticalAlignment/SheetVerticalAlignmentPlugin';
export {
  SheetHorizontalAlignment,
  assertSheetHorizontalAlignment,
  isSheetHorizontalAlignment,
  SheetVerticalAlignment,
  assertSheetVerticalAlignment,
  isSheetVerticalAlignment,
} from '@searsuite/sear-domain-cell-types';
export { AlignmentMatrix, type AlignmentMatrixData } from './AlignmentMatrix';
export { VerticalAlignmentMatrix, type VerticalAlignmentMatrixData } from './VerticalAlignmentMatrix';
export {
  SetRangeAlignmentCommand,
  registerSheetHorizontalAlignmentCommand,
  createSetRangeAlignmentOperations,
  type SheetSetRangeAlignmentInput,
  type SheetHorizontalAlignmentCommandDataSource,
} from './sheetPlugin/alignment/SheetAlignmentCommands';
export {
  readSheetCellAlignments,
  SheetHorizontalAlignmentFieldKey,
} from './sheetPlugin/alignment/SheetAlignmentDataField';
export {
  SetRangeVerticalAlignmentCommand,
  registerSheetVerticalAlignmentCommand,
  createSetRangeVerticalAlignmentOperations,
  type SheetSetRangeVerticalAlignmentInput,
  type SheetVerticalAlignmentCommandDataSource,
} from './sheetPlugin/verticalAlignment/SheetVerticalAlignmentCommands';
export {
  readSheetCellVerticalAlignments,
  SheetVerticalAlignmentFieldKey,
} from './sheetPlugin/verticalAlignment/SheetVerticalAlignmentDataField';
