/** Observable pipeline and step names owned by the Cell Editor module. */
export enum SheetCellEditorPipelineName {
  EnterEditMode = 'cell-editor.enter-edit-mode',
  CancelEdit = 'cell-editor.cancel-edit',
  CommitEdit = 'cell-editor.commit-edit',
  EditExitAndSelect = 'cell-editor.exit-and-select',
  StartEditSession = 'cell-editor.start-edit-session',
  EndEditSession = 'cell-editor.end-edit-session',
}

/** Enumerates SheetCellEditorPipelineStepName values. */
export enum SheetCellEditorPipelineStepName {
  OpenEditor = 'cell-editor.open',
  CommitValue = 'cell-editor.commit-value',
  ExitEditMode = 'cell-editor.exit-edit-mode',
  SelectCell = 'cell-editor.select-cell',
  StartEditSession = 'cell-editor.start-edit-session',
  EndEditSession = 'cell-editor.end-edit-session',
}

/** Enumerates SheetCellEditorInteractionName values. */
export enum SheetCellEditorInteractionName {
  SessionStarted = 'edit-session-started',
  SessionEnded = 'edit-session-ended',
}

/** Enumerates SheetCellEditorKind values. */
export enum SheetCellEditorKind {
  Cell = 'cell',
}

/** Enumerates SheetCellEditorExitReason values. */
export enum SheetCellEditorExitReason {
  Commit = 'commit',
  Cancel = 'cancel',
  OutsideClick = 'outside-click',
}
