/** Observable pipeline and step names owned by the Selection module. */
export enum SheetSelectionPipelineName {
  SelectionChange = 'selection-change',
}

/** Enumerates SheetSelectionPipelineStepName values. */
export enum SheetSelectionPipelineStepName {
  UpdateSelection = 'selection.update-selection',
  RecordSelectionChange = 'selection.record-selection-change',
  EnsureSelectionVisible = 'selection.ensure-selection-visible',
}

/** Enumerates SheetSelectionInteractionName values. */
export enum SheetSelectionInteractionName {
  Changed = 'selection-changed',
}

/** Enumerates SheetSelectionSource values. */
export enum SheetSelectionSource {
  Pointer = 'pointer',
  Keyboard = 'keyboard',
  Api = 'api',
}
