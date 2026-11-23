/**
 * Workbook structure, Sheet mounting, workbook commands, sessions, and shared runtime services.
 *
 * @packageDocumentation
 */

/**
 * @referenceChapter 0 create-workbook Compose a Workbook around Sheet editors
 * @referenceBody
 * `createWorkbookEditor()` creates the Workbook runtime and mounts a Sheet editor for the active Sheet. The Workbook
 * owns structure and shared services; the mounted Sheet editor owns its own commands, queries, services, and
 * selected plugins. `WorkbookEditor` keeps structural reads under `document` and mounted-Sheet access under `sheets`.
 *
 * **Use when:** a product needs several Sheets with stable identities, switching, structural commands, or shared
 * Workbook services. A single Sheet host can use `createSheetEditor()` directly.
 */

/**
 * @referenceChapter 1 switch-and-change Switch Sheets without conflating state
 * @referenceBody
 * `ActivateWorkbookSheetCommand` captures the current Sheet document and local session, tears down that Sheet
 * editor, and mounts the requested Sheet. The session is restored when returning to it. Workbook structural commands
 * such as `AddWorkbookSheetCommand` and `RenameWorkbookSheetCommand` stage changes in a separate history from cell
 * edits inside the active Sheet.
 *
 * Stable `sheetId` values identify Sheets across rename and reorder operations. A host should use the Workbook
 * document API for structure and the mounted Sheet API for content. `WorkbookPlugin` contributions can own shared
 * services that survive a Sheet remount.
 */

export {
  WorkbookCommandBus,
  type WorkbookCommandEvent,
  type WorkbookCommandBusOptions,
  type WorkbookCommandHandler,
  type WorkbookCommandListener,
} from './WorkbookCommandBus';
export {
  defineWorkbookCommand,
  type WorkbookCommandDefinition,
  type WorkbookCommandDefinitionResult,
  type WorkbookCommandInput,
} from './WorkbookCommandDefinition';
export {
  ActivateWorkbookSheetCommand,
  AddWorkbookSheetCommand,
  HideWorkbookSheetCommand,
  MoveWorkbookSheetCommand,
  RemoveWorkbookSheetCommand,
  RenameWorkbookSheetCommand,
  UnhideWorkbookSheetCommand,
  registerDefaultWorkbookCommands,
  type ActivateWorkbookSheetCommandInput,
  type AddWorkbookSheetCommandInput,
  type HideWorkbookSheetCommandInput,
  type MoveWorkbookSheetCommandInput,
  type RemoveWorkbookSheetCommandInput,
  type RenameWorkbookSheetCommandInput,
  type UnhideWorkbookSheetCommandInput,
  type WorkbookCommandController,
  type WorkbookCommandResult,
} from './WorkbookCommands';
export { createWorkbookEditor } from './createWorkbookEditor';
export {
  type WorkbookEditor,
  type WorkbookEditorConfiguration,
  type WorkbookSheetEditorFactory,
  type WorkbookSheetEditorFactoryInput,
  type WorkbookSheetStateCapture,
  type WorkbookSheetStateCaptureInput,
  type WorkbookSheetSessionStateCapture,
  type WorkbookSheetSessionStateCaptureInput,
} from './WorkbookEditorContracts';
export { type WorkbookDocumentApi } from './WorkbookDocumentApi';
export { type WorkbookSheetsApi } from './WorkbookSheetsApi';
export {
  WorkbookPlugin,
  registerWorkbookPluginCapabilities,
  registerWorkbookPluginCommands,
  registerWorkbookPluginObservations,
  registerWorkbookPluginSessionStates,
  resolveWorkbookPlugins,
  type WorkbookCompanionSheetPluginContext,
  type WorkbookCompanionSheetService,
  type WorkbookPluginContext,
  type WorkbookPluginDisposer,
  type WorkbookPluginImplementation,
  type WorkbookPluginRuntime,
  type WorkbookPluginServiceContext,
} from './WorkbookPluginContracts';
export {
  WorkbookRuntimeCapability,
  WorkbookRuntimeExtensionRegistry,
  defineWorkbookRuntimeCapability,
  type WorkbookRuntimeCapabilityReader,
  type WorkbookRuntimeCapabilityToken,
} from './WorkbookRuntimeExtensionRegistry';
export {
  WorkbookActiveSheetEditorObservation,
  WorkbookDocumentStateObservation,
  type WorkbookActiveSheetEditorSnapshot,
} from './WorkbookObservations';
export {
  WorkbookFormulaBrokenReferenceReason,
  WorkbookFormulaGraphReferenceKind,
  WorkbookFormulaDependencyGraph,
  isWorkbookFormulaBrokenReference,
  type WorkbookFormulaBrokenReference,
  type WorkbookFormulaGraphReference,
} from './WorkbookFormulaDependencyGraph';
export {
  RecalculateWorkbookFormulasCommand,
  type RecalculateWorkbookFormulasCommandResult,
} from './WorkbookFormulaCommands';
export {
  WorkbookFormulaEvaluationRuntime,
  type CompiledWorkbookFormula,
  type WorkbookFormulaCompiledReferenceShiftResult,
  type WorkbookFormulaRecalculationResult,
} from './WorkbookFormulaEvaluationRuntime';
export {
  WorkbookFormulaReferenceShifter,
  type WorkbookFormulaReferenceShiftResult,
} from './WorkbookFormulaReferenceShifter';
export {
  WorkbookFormulaSheetTransactionObservation,
  WorkbookFormulaStateObservation,
  WorkbookFormulaStructureResultsChangedObservation,
  type WorkbookFormulaSheetTransactionEvent,
  type WorkbookFormulaStateSnapshot,
} from './WorkbookFormulaObservations';
export { WorkbookFormulaPlugin } from './workbookPlugin/formula/WorkbookFormulaPlugin';
export {
  CancelWorkbookFormulaReferencePickCommand,
  CaptureWorkbookFormulaDraftCommand,
  PickWorkbookFormulaReferenceCommand,
  RestoreWorkbookFormulaDraftCommand,
} from './workbookPlugin/formulaReferencePick/WorkbookFormulaReferencePickCommands';
export {
  WorkbookCollaborationCapability,
  WorkbookCollaborationPlugin,
  WorkbookCollaborationTransportFactory,
  type WorkbookCollaborationSession,
} from './workbookPlugin/collaboration/WorkbookCollaborationPlugin';
export {
  ConnectWorkbookCollaborationCommand,
  DisconnectWorkbookCollaborationCommand,
} from './workbookPlugin/collaboration/WorkbookCollaborationCommands';
export {
  RedoWorkbookCommand,
  UndoWorkbookCommand,
  WorkbookHistoryPlugin,
  WorkbookHistorySessionStateDefinition,
  WorkbookHistoryStatusObservation,
  type WorkbookHistoryEntry,
  type WorkbookHistorySessionState,
  type WorkbookHistoryStatus,
} from './workbookPlugin/history/WorkbookHistoryPlugin';
export {
  WorkbookActiveSheetSessionStateDefinition,
  WorkbookSessionStore,
  WorkbookSheetSessionsStateDefinition,
  type WorkbookSessionState,
} from './WorkbookSessionState';
export {
  CaptureWorkbookSessionStateCommand,
  ExportWorkbookStateCommand,
  type CaptureWorkbookSessionStateCommandResult,
  type ExportWorkbookStateCommandResult,
} from './WorkbookStateCommands';
export {
  deserializeWorkbookDocumentState,
  serializeWorkbookDocumentState,
  type WorkbookDocumentStateSerializationOptions,
} from './WorkbookExport';
export {
  WorkbookHistoryAction,
  WorkbookTransaction,
  type WorkbookTransactionCommittedEvent,
  type WorkbookTransactionReducer,
  type WorkbookTransactionState,
} from './WorkbookTransaction';
export { CommandExecutionPhase } from '@searsuite/sear-foundation-common';
export { WorkbookRangeMoveError } from './WorkbookRangeMoveError';
export { WorkbookStructureMoveError } from './WorkbookStructureMoveError';
export { WorkbookFormulaObjectsMetadataKey, type WorkbookFormulaObjects, type WorkbookFormulaTable } from './WorkbookFormulaObjects';
export { WorkbookFormulaBindingsMetadataKey } from './WorkbookFormulaBindingEnvelope';
export {
  WorkbookFormulaObjectsPlugin,
  WorkbookFormulaObjectsObservation,
  SetWorkbookDefinedNameCommand,
  RemoveWorkbookDefinedNameCommand,
  SetWorkbookFormulaTableCommand,
  RemoveWorkbookFormulaTableCommand,
  type SetWorkbookDefinedNameInput,
} from './workbookPlugin/formulaObjects/WorkbookFormulaObjectsPlugin';
