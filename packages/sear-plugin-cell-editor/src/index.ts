/**
 * Sheet cell-edit sessions, text input, selection, and embedded-editor coordination.
 *
 * @packageDocumentation
 */

export { SheetCellEditorPlugin } from './SheetCellEditor';
export { SetRangeCellTextStyleCommand, type SheetRangeTextStyleInput } from './SheetRangeTextStyleCommand';
export {
  BeginCellEditCommand,
  OpenCellEditorCommand,
  CancelCellEditCommand,
  CommitCellEditCommand,
  InsertCurrentDateTimeCommand,
  HandleDocumentInputCommand,
  HandleCellEditorPointerCommand,
  BeginCellEditorDragSelectionCommand,
  EndCellEditorDragSelectionCommand,
  ReplaceFormulaReferenceCommand,
  EndFormulaReferencePickCommand,
  RequestCellEditorRenderCommand,
  UpdateCellEditorDocumentSelectionCommand,
  SetCellInlineStyleCommand,
  AcceptFormulaSuggestionCommand,
  MoveFormulaSuggestionCommand,
  UpdateFormulaAssistAnchorCommand,
  CycleFormulaReferenceCommand,
  RestoreFormulaEditDraftCommand,
  StartFormulaBarEditCommand,
  SetFormulaBarDraftCommand,
  HandleFormulaBarKeyCommand,
  type SheetBeginCellEditInput,
  type SheetOpenCellEditorInput,
  type SheetCancelCellEditInput,
  type SheetCellEditSelectionInput,
  type SheetCommitCellEditInput,
  type SheetDocumentCursorPositionInput,
  type SheetDocumentInputCommandInput,
  type SheetCellEditorPointerInput,
  type SheetFormulaReferenceReplacementInput,
  type SheetDocumentSelectionCommandInput,
  type SheetInlineStyleCommandInput,
  type SheetFormulaBarKeyInput,
} from './SheetCellEditorCommands';
export { getCellEditableValue } from './CellEditableValue';
export { Highlighter, type Highlighting, type HighlightContext, type CellRangeHighlight } from './Highlighter';
export { FormulaReferenceHighlighter } from './FormulaReferenceHighlighter';
export {
  SheetCellEditorExitReason,
  SheetCellEditorInteractionName,
  SheetCellEditorKind,
  SheetCellEditorPipelineName,
  SheetCellEditorPipelineStepName,
} from './SheetCellEditorPipelineNames';
export {
  FormulaInputAssistObservation,
  type FormulaInputAssistState,
} from './formulaAssist/FormulaInputAssistObservation';
export { FormulaReferencePickService, type FormulaEditDraft } from './formulaAssist/FormulaReferencePick';
export { ReadFormulaEditDraftQuery } from './formulaAssist/ReadFormulaEditDraftQuery';
export { SheetFormulaBarObservation, type SheetFormulaBarState } from './SheetFormulaBarObservation';
export { findTrailingSheetQualifierStart, formatPickedReference } from './formulaAssist/formatPickedReference';
export {
  registerSheetCellEditorInteractionReducers,
  type EditSessionEndedInteractionSignal,
  type EditSessionStartedInteractionSignal,
} from './SheetCellEditorInteractionReducer';

export { IsCellEditingQuery } from './IsCellEditingQuery';
export { ReadSelectedCellEditTextQuery } from './ReadSelectedCellEditTextQuery';
