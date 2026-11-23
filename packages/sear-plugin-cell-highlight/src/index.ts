/**
 * Conditional cell highlight rules, sparse range state, commands, and rendering contributions.
 *
 * @packageDocumentation
 */
export { CellHighlightMatrix, type PositionedCellHighlightRule } from './CellHighlightMatrix';
export {
  CellHighlightKind, CellHighlightValueOperator, CellHighlightTextOperator, CellHighlightStyle,
  type CellHighlightRule, type CellHighlightCondition,
} from './CellHighlightRule';
export {
  AddCellHighlightRuleCommand, UpdateCellHighlightRuleCommand, RemoveCellHighlightRuleCommand, ClearCellHighlightRulesCommand,
  ReadCellHighlightRulesQuery, type AddCellHighlightRuleInput, type UpdateCellHighlightRuleInput,
} from './sheetPlugin/cellHighlight/SheetCellHighlightCommands';
export { SheetCellHighlightPlugin, type SheetCellHighlightPluginState } from './sheetPlugin/cellHighlight/SheetCellHighlightPlugin';
export { type CellHighlightValueReader, type CellHighlightValueRangeReader } from './evaluateCellHighlight';
export { type CellHighlightNumericRangeReader } from './CellHighlightRangeStatistics';
export { SheetCellHighlightFieldKey, readSheetCellHighlights } from './sheetPlugin/cellHighlight/SheetCellHighlightDataField';
