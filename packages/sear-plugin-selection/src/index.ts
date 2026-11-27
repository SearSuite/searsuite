/**
 * Sheet selection state, navigation, observations, highlights, and commands.
 *
 * @packageDocumentation
 */

/**
 * @referenceChapter 0 select-and-read Select a range, then read the committed selection
 * @referenceBody
 * `SheetSelectionPlugin` owns Sheet selection state. `SelectRangeCommand` requests a new anchor and focus; the
 * plugin expands a range when it intersects a merged cell, stages selection operations, and publishes a selection
 * change after commit. `GetSelection` and `GetSelections` read the resulting state, while observations notify a host
 * that needs to update its interface.
 *
 * ```ts
 * import { GetSelection, SelectRangeCommand } from '@searsuite/sear-plugin-selection';
 *
 * editor.commands.run(SelectRangeCommand, { anchor: [2, 3], focus: [2, 3] });
 * const selection = editor.queries.run(GetSelection, undefined);
 * ```
 *
 * **Use when:** responding to pointer, keyboard, or application navigation. Coordinates are zero-based. A host
 * should run the command rather than writing the selection matrix or highlight state directly.
 */

/**
 * @referenceChapter 1 selection-session Distinguish selection state from its visual highlight
 * @referenceBody
 * Selection has document-facing operations, local navigation state, and a render projection. `SheetHighlightView`
 * draws the current range and can combine additional highlight providers; it does not become the owner of the
 * selected range. `EnsureSelectionVisibleCommand` asks the viewport to reveal the selection after navigation.
 *
 * Workbook remounting captures the local selection session through `SheetSelectionSessionStateDefinition`. The
 * feature's command and query contracts remain the same when the active Sheet is recreated.
 */

export {
  SheetSelectionPlugin,
  SheetSelectionSessionStateDefinition,
  type SheetSelectionSessionState,
} from './sheetSelection/SheetSelectionPlugin';
export {
  EnsureSelectionVisibleCommand,
  SelectRangeCommand,
  SheetAdditionalSelectionMode,
  type SheetEnsureSelectionVisibleInput,
  type SheetSelectRangeInput,
  GetSelection,
  GetSelections,
  GetSelectionNavigation,
  ClearSelectedContentsCommand,
  registerSelectionQueries,
} from './SheetSelectionCommands';
export { GetActiveCell } from './GetActiveCell';
export {
  SheetSelectionInteractionName,
  SheetSelectionPipelineName,
  SheetSelectionPipelineStepName,
  SheetSelectionSource,
} from './SheetSelectionPipelineNames';
export {
  registerSheetSelectionInteractionReducers,
  type SelectionChangedInteractionSignal,
} from './SheetSelectionInteractionReducer';
export { MoveSheetRangeCommand, GetSheetRangeMoveConflict, type MoveSheetRangeInput } from './SheetRangeMoveCommands';
export { AnalyzeSheetRangeMove } from './AnalyzeSheetRangeMove';
export { SheetRangeMoveError, SheetRangeMoveErrorCode } from './SheetRangeMoveError';
export { FillSheetRangeCommand, type SheetFillRangeInput } from './SheetFillRangeCommand';
export { SheetDragAxis } from './SheetDragAxis';

export { type SheetSelectionOptions } from './SheetSelectionOptions';
export { type SheetAxisDragDestination, commitAxisDrag } from './SheetAxisDrag';
