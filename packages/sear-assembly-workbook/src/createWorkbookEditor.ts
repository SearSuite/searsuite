import { cloneSessionStateValue, createRuntimeCapabilityReader, RuntimeCapabilityRegistry, SessionStateRegistry, SessionStateRestorePhase } from '@searsuite/sear-assembly-plugin';
import {
  CaptureSheetSessionStateCommand,
  ExportSheetStateCommand,
  createSheetEditor,
  type SheetEditor,
  type SheetDocumentState,
  type SheetSessionState,
  SheetClipboardWorkbookBridgeSymbol,
  type SheetClipboardWorkbookBridge,
  serializeSheetDocumentState,
} from '@searsuite/sear-assembly-setup';
import {
  addWorkbookSheet,
  getWorkbookSheetDescriptor,
  getWorkbookSheetState,
  moveWorkbookSheet,
  removeWorkbookSheet,
  renameWorkbookSheet,
  setWorkbookSheetHidden,
  updateWorkbookSheetState,
  validateWorkbookDocumentState,
  type WorkbookDocumentState,
  type WorkbookSheetId,
} from '@searsuite/sear-domain-workbook';
import { Container, Scope } from '@searsuite/sear-foundation-di';
import { SearError } from '@searsuite/sear-foundation-error';
import { SearContractViolationError, lockCommittedSheetState } from '@searsuite/sear-assembly-core';
import { Platform } from '@searsuite/sear-foundation-platform';
import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { WorkbookCommandBus } from './WorkbookCommandBus';
import { defineWorkbookCommand } from './WorkbookCommandDefinition';
import {
  UnregisterWorkbookFormulaFunctionCommand,
  UnregisterWorkbookFormulaExternalServiceCommand,
  UnregisterWorkbookFormulaTextServiceCommand,
} from './WorkbookFormulaCommands';
import { FormulaRegistryOwnership } from '@searsuite/sear-plugin-formula';
import { SheetFormatPainterSession } from '@searsuite/sear-plugin-format-painter';
import { SheetClipboardCutSession, SheetClipboardSheetIdentity } from '@searsuite/sear-plugin-clipboard';
import { CommitCellEditCommand, IsCellEditingQuery } from '@searsuite/sear-plugin-cell-editor';

interface CommitClipboardMoveInput {
  readonly cutId: string;
  readonly sourceId: WorkbookSheetId;
  readonly targetId: WorkbookSheetId;
  readonly targetAfter: SheetDocumentState;
}

const CommitClipboardMoveCommand = defineWorkbookCommand<CommitClipboardMoveInput, WorkbookCommandResult>(
  'workbook.clipboard.commitMove',
);
import {
  type ActivateWorkbookSheetCommandInput,
  type AddWorkbookSheetCommandInput,
  type HideWorkbookSheetCommandInput,
  type MoveWorkbookSheetCommandInput,
  type RemoveWorkbookSheetCommandInput,
  type RenameWorkbookSheetCommandInput,
  registerDefaultWorkbookCommands,
  type UnhideWorkbookSheetCommandInput,
  type WorkbookCommandController,
  type WorkbookCommandResult,
} from './WorkbookCommands';
import { RedoWorkbookCommand, UndoWorkbookCommand, WorkbookHistoryPlugin } from './workbookPlugin/history/WorkbookHistoryPlugin';
import { SheetExternalHistory } from '@searsuite/sear-plugin-history';
import { WorkbookFormulaReferencePickPlugin } from './workbookPlugin/formulaReferencePick/WorkbookFormulaReferencePickPlugin';
import { WorkbookFormulaCrossSheetHighlightPlugin } from './workbookPlugin/formulaHighlight/WorkbookFormulaCrossSheetHighlightPlugin';
import { WorkbookFormulaObjectsPlugin } from './workbookPlugin/formulaObjects/WorkbookFormulaObjectsPlugin';
import { renameWorkbookFormulaObjectsSheet } from './WorkbookFormulaObjects';
import {
  WorkbookCollaborationPlugin,
  WorkbookCollaborationTransportFactory,
} from './workbookPlugin/collaboration/WorkbookCollaborationPlugin';
import {
  WorkbookActiveSheetEditorObservation,
  WorkbookDocumentStateObservation,
  type WorkbookActiveSheetEditorSnapshot,
} from './WorkbookObservations';
import {
  registerWorkbookPluginCapabilities,
  registerWorkbookPluginCommands,
  registerWorkbookPluginObservations,
  registerWorkbookPluginSessionStates,
  resolveWorkbookPlugins,
  type WorkbookPlugin,
  type WorkbookPluginContext,
  type WorkbookPluginDisposer,
  type WorkbookPluginImplementation,
  type WorkbookPluginRuntime,
  type WorkbookPluginServiceContext,
} from './WorkbookPluginContracts';
import { firstVisibleSheetId, WorkbookSessionStore } from './WorkbookSessionState';
import { registerWorkbookStateCommands } from './WorkbookStateCommands';
import {
  WorkbookHistoryAction,
  WorkbookTransaction,
  type WorkbookTransactionCommittedEvent,
  type WorkbookTransactionState,
} from './WorkbookTransaction';
import { WorkbookRuntimeCapability, WorkbookRuntimeExtensionRegistry } from './WorkbookRuntimeExtensionRegistry';
import {
  type WorkbookEditor,
  type WorkbookEditorConfiguration,
  type WorkbookSheetEditorFactory,
  type WorkbookSheetEditorFactoryInput,
  type WorkbookSheetSessionStateCapture,
  type WorkbookSheetSessionStateCaptureInput,
  type WorkbookSheetStateCapture,
  type WorkbookSheetStateCaptureInput,
} from './WorkbookEditorContracts';
import { type WorkbookDocumentApi } from './WorkbookDocumentApi';
import { type WorkbookSheetsApi } from './WorkbookSheetsApi';
import { cloneWorkbookEditorDocumentState } from './cloneWorkbookEditorDocumentState';
import { sealWorkbookPluginTeardownWrites } from './sealWorkbookPluginTeardownWrites';
import {
  IFormulaTextServiceProvider,
  IFormulaExternalServiceProvider,
  IFunctionRegistry,
  FormulaAddInServiceDefinition,
} from '@searsuite/sear-domain-formula-engine';
import {
  FormulaExternalServiceRegistry,
  FormulaTextServiceRegistry,
  FunctionRegistry,
  UnavailableFormulaAddInService,
} from '@searsuite/sear-domain-formula-engine-ts';
import {
  UnavailableWebServiceClient,
  WebServiceClient,
  UnavailableXmlDocumentParser,
  UnavailableXmlXPathEngine,
  XmlDocumentParser,
  XmlXPathEngine,
  XmlXPathEvaluator,
} from '@searsuite/sear-foundation-platform';

/**
 * Creates a Workbook editor with an isolated DI container and plugin graph.
 *
 * Workbook-owned services survive individual Sheet mounts. The editor keeps
 * structure, collaboration channels, formula registries, and detached Sheet
 * sessions keyed by stable Sheet identifiers.
 *
 * @param configuration Workbook document state, host adapters, and Workbook and Sheet plugins.
 * @returns A Workbook facade that owns its mounted Sheet editor lifecycle.
 * @example
 * ```ts
 * const workbook = createWorkbookEditor(configuration);
 * await workbook.commands.run(ActivateWorkbookSheetCommand, { sheetId });
 * workbook.destroy();
 * ```
 */
export function createWorkbookEditor(configuration: WorkbookEditorConfiguration): WorkbookEditor {
  validateWorkbookDocumentState(configuration.documentState);
  const container = new Container();
  const platform = new configuration.adapters.platform();
  container.registerInstance(Platform.symbol, platform);
  container.register(
    XmlDocumentParser.symbol,
    configuration.adapters.xmlDocumentParser ?? UnavailableXmlDocumentParser,
    Scope.Singleton,
  );
  container.register(
    XmlXPathEngine.symbol,
    configuration.adapters.xmlXPathEngine ?? UnavailableXmlXPathEngine,
    Scope.Singleton,
  );
  if (configuration.adapters.xmlXPathEvaluator) {
    container.register(XmlXPathEvaluator.symbol, configuration.adapters.xmlXPathEvaluator, Scope.Singleton);
  } else {
    container.registerFactory(
      XmlXPathEvaluator.symbol,
      () => new XmlXPathEvaluator(
        container.resolve<XmlDocumentParser>(XmlDocumentParser.symbol),
        container.resolve<XmlXPathEngine>(XmlXPathEngine.symbol),
      ),
      Scope.Singleton,
    );
  }
  container.register(
    WebServiceClient.symbol,
    configuration.adapters.webServiceClient ?? UnavailableWebServiceClient,
    Scope.Singleton,
  );
  container.registerFactory(
    WorkbookCommandBus.symbol,
    () => new WorkbookCommandBus(configuration.warn ? { warn: configuration.warn } : {}),
    Scope.Singleton,
  );
  container.registerInstance(WorkbookCollaborationTransportFactory.symbol, {
    create: () => new configuration.adapters.collabTransport(),
  });
  container.register(ObservationRegistry.symbol, ObservationRegistry, Scope.Singleton);
  container.register(SessionStateRegistry.symbol, SessionStateRegistry, Scope.Singleton);
  container.registerFactory(
    IFunctionRegistry.symbol,
    configuration.adapters.createFunctionRegistry ?? (() => new FunctionRegistry()),
    Scope.Singleton,
  );
  container.registerInstance(IFormulaTextServiceProvider.symbol, new FormulaTextServiceRegistry());
  const formulaExternalServices = new FormulaExternalServiceRegistry((message, error) => platform.warn(message, error));
  formulaExternalServices.register(FormulaAddInServiceDefinition, new UnavailableFormulaAddInService());
  container.registerInstance(IFormulaExternalServiceProvider.symbol, formulaExternalServices);
  container.registerFactory(
    WorkbookRuntimeExtensionRegistry.symbol,
    () => new WorkbookRuntimeExtensionRegistry(),
    Scope.Singleton,
  );
  container.registerFactory(
    WorkbookSessionStore.symbol,
    () => new WorkbookSessionStore(configuration.documentState),
    Scope.Singleton,
  );

  let controller: DefaultWorkbookEditor | null = null;
  try {
    const pluginImplementations = [
      WorkbookHistoryPlugin,
      WorkbookCollaborationPlugin,
      WorkbookFormulaCrossSheetHighlightPlugin,
      WorkbookFormulaReferencePickPlugin,
      WorkbookFormulaObjectsPlugin,
      ...(configuration.plugins ?? []),
    ];
    registerWorkbookPluginImplementations(container, pluginImplementations);
    const plugins = resolveWorkbookPlugins(container, pluginImplementations);
    controller = new DefaultWorkbookEditor(container, configuration, plugins);
    return controller.initialize();
  } catch (error) {
    if (controller) controller.destroyAfterFailedInitialization();
    else {
      container.resolve<IFormulaExternalServiceProvider>(IFormulaExternalServiceProvider.symbol).destroy();
      container.reset();
    }
    throw error;
  }
}

class DefaultWorkbookEditor implements WorkbookCommandController {
  readonly #container: Container;
  readonly #configuration: WorkbookEditorConfiguration;
  readonly #plugins: readonly WorkbookPlugin[];

  readonly #formatPainterSession = new SheetFormatPainterSession();
  readonly #clipboardCutSession = new SheetClipboardCutSession();
  #preparedClipboardCut: {
    readonly id: string;
    readonly sourceId: WorkbookSheetId;
    readonly sourceSignature: string;
    readonly sourceAfter: SheetDocumentState;
  } | null = null;
  readonly #sessionLifecycleToken = {};
  readonly #formulaServiceTeardownToken = {};
  readonly #commands: WorkbookCommandBus;
  readonly #isCommandExecuting: () => boolean;
  readonly #observations: ObservationRegistry;
  readonly #session: SessionStateRegistry;
  readonly #extensions: WorkbookRuntimeExtensionRegistry;
  readonly #sessionStore: WorkbookSessionStore;
  readonly #sheetEditorFactory: WorkbookSheetEditorFactory;
  readonly #captureSheetState: WorkbookSheetStateCapture;
  readonly #captureSheetSessionState: WorkbookSheetSessionStateCapture;
  readonly #document: WorkbookDocumentApi;
  readonly #publicDocument: WorkbookDocumentApi;
  readonly #sheets: WorkbookSheetsApi;
  readonly #documentStateListeners = new Set<(state: WorkbookDocumentState<SheetDocumentState>) => void>();
  readonly #activeSheetEditorListeners = new Set<(snapshot: WorkbookActiveSheetEditorSnapshot) => void>();
  readonly #pluginDisposers: WorkbookPluginDisposer[] = [];
  readonly #pluginRuntime: WorkbookPluginRuntime;
  #documentState: WorkbookDocumentState<SheetDocumentState>;
  #activeSheetEditor: SheetEditor | null = null;
  #destroyed = false;
  #destroying = false;
  #publicEditor: WorkbookEditor | null = null;

  public constructor(
    container: Container,
    configuration: WorkbookEditorConfiguration,
    plugins: readonly WorkbookPlugin[],
  ) {
    this.#container = container;
    this.#configuration = configuration;
    this.#plugins = plugins;
    this.#documentState = cloneWorkbookEditorDocumentState(configuration.documentState);
    lockCommittedSheetState(this.#documentState);
    FormulaExternalServiceRegistry.prototype.enforceTeardownBoundary.call(
      container.resolve<IFormulaExternalServiceProvider>(IFormulaExternalServiceProvider.symbol),
      this.#formulaServiceTeardownToken,
    );
    this.#commands = container.resolve<WorkbookCommandBus>(WorkbookCommandBus.symbol);
    this.#isCommandExecuting = this.#commands.isExecuting.bind(this.#commands);
    this.#observations = container.resolve<ObservationRegistry>(ObservationRegistry.symbol);
    this.#session = container.resolve<SessionStateRegistry>(SessionStateRegistry.symbol);
    this.#extensions = container.resolve<WorkbookRuntimeExtensionRegistry>(WorkbookRuntimeExtensionRegistry.symbol);
    this.#sessionStore = container.resolve<WorkbookSessionStore>(WorkbookSessionStore.symbol);
    this.#sheetEditorFactory = configuration.sheetEditorFactory ?? createDefaultSheetEditor;
    this.#captureSheetState = configuration.captureSheetState ?? exportActiveSheetStateThroughCommand;
    this.#captureSheetSessionState =
      configuration.captureSheetSessionState ?? captureActiveSheetSessionStateThroughCommand;
    this.#document = {
      getState: () => {
        this.#assertLive();
        return this.#documentState;
      },
    };
    this.#publicDocument = {
      getState: () => {
        this.#assertLive();
        return cloneWorkbookEditorDocumentState(this.#documentState);
      },
    };
    this.#sheets = {
      getActiveId: () => {
        this.#assertLive();
        return this.#sessionStore.getActiveSheetId();
      },
      getActiveEditor: () => this.#requireActiveSheetEditor(),
      getEditor: (sheetId) => {
        this.#assertLive();
        return sheetId === this.#sessionStore.getActiveSheetId() ? this.#requireActiveSheetEditor() : null;
      },
    };
    this.#pluginRuntime = this.#createPluginRuntime();
  }

  public initialize(): WorkbookEditor {
    registerDefaultWorkbookCommands(this.#commands, this);
    this.#commands.register(CommitClipboardMoveCommand, (input) => this.#commitClipboardMove(input));
    this.#commands.register(UnregisterWorkbookFormulaFunctionCommand, (id) =>
      this.#container.resolve<IFunctionRegistry>(IFunctionRegistry.symbol).unregisterRegistration(id));
    this.#commands.register(UnregisterWorkbookFormulaExternalServiceCommand, (id) =>
      this.#container.resolve<IFormulaExternalServiceProvider>(IFormulaExternalServiceProvider.symbol).unregisterRegistration(id));
    this.#commands.register(UnregisterWorkbookFormulaTextServiceCommand, (id) =>
      this.#container.resolve<IFormulaTextServiceProvider>(IFormulaTextServiceProvider.symbol).unregisterRegistration?.(id));
    registerWorkbookStateCommands(this.#commands, this.#session, () => this.#exportDocumentState());
    this.#registerObservations();
    registerWorkbookPluginCommands(this.#plugins, this.#commands);
    registerWorkbookPluginObservations(this.#plugins, this.#observations);
    this.#sessionStore.registerSessionState(this.#session);
    registerWorkbookPluginSessionStates(this.#plugins, this.#session);
    this.#registerDefaultCapabilities();
    registerWorkbookPluginCapabilities(this.#plugins, this.#extensions);
    this.#sessionStore.bindActiveSheetCapture(() => this.#captureLiveSheetSession());
    this.#session.loadSnapshot(this.#configuration.sessionState ?? {});
    this.#session.restorePhase(SessionStateRestorePhase.BeforeInitialize);
    this.#sessionStore.validate(this.#documentState);
    this.#activeSheetEditor = this.#createSheetEditor(this.#sessionStore.getActiveSheetId(), this.#documentState);
    this.#session.restorePhase(SessionStateRestorePhase.AfterInitialize);
    this.#session.sealRestoration(this.#sessionLifecycleToken);
    WorkbookSessionStore.prototype.enforceCommandBoundary.call(
      this.#sessionStore, this.#isCommandExecuting, this.#sessionLifecycleToken);
    this.#initializePlugins();
    const functions = this.#container.resolve<IFunctionRegistry>(IFunctionRegistry.symbol);
    const removeFunction = (id: number) => this.#commands.run(UnregisterWorkbookFormulaFunctionCommand, id);
    if (functions instanceof FunctionRegistry) {
      FunctionRegistry.prototype.enforceCommandBoundary.call(functions, this.#isCommandExecuting, removeFunction);
    } else functions.enforceCommandBoundary(this.#isCommandExecuting, removeFunction);
    const externalServices = this.#container.resolve<IFormulaExternalServiceProvider>(IFormulaExternalServiceProvider.symbol);
    const removeExternalService = (id: number) => this.#commands.run(UnregisterWorkbookFormulaExternalServiceCommand, id);
    if (externalServices instanceof FormulaExternalServiceRegistry) {
      FormulaExternalServiceRegistry.prototype.enforceCommandBoundary.call(
        externalServices, this.#isCommandExecuting, removeExternalService);
    } else externalServices.enforceCommandBoundary(this.#isCommandExecuting, removeExternalService);
    const textServices = this.#container.resolve<IFormulaTextServiceProvider>(IFormulaTextServiceProvider.symbol);
    const removeTextService = (id: number) => this.#commands.run(UnregisterWorkbookFormulaTextServiceCommand, id);
    if (textServices instanceof FormulaTextServiceRegistry) {
      FormulaTextServiceRegistry.prototype.enforceCommandBoundary.call(textServices, this.#isCommandExecuting, removeTextService);
    } else textServices.enforceCommandBoundary?.(this.#isCommandExecuting, removeTextService);
    const assertExtensionCommand = (): void => {
      if (!this.#destroying && !this.#isCommandExecuting()) {
        throw new SearContractViolationError('Workbook extensions must change through editor.commands.run(...).');
      }
    };
    ObservationRegistry.prototype.enforceWriteBoundary.call(this.#observations,
      assertExtensionCommand, this.#commands.runWithoutMutationAuthority.bind(this.#commands),
      (value, definition) => {
        if (definition.id === WorkbookActiveSheetEditorObservation.id)
          return { ...(value as WorkbookActiveSheetEditorSnapshot) };
        if (definition.id === WorkbookDocumentStateObservation.id)
          return value;
        return cloneSessionStateValue(value);
      },
    );
    RuntimeCapabilityRegistry.prototype.enforceWriteBoundary.call(this.#extensions, assertExtensionCommand);
    sealWorkbookPluginTeardownWrites(this.#plugins, assertExtensionCommand);
    const editor = this.#createPublicEditor();
    this.#configuration.onCreated?.(editor);
    WorkbookCommandBus.prototype.enforceRegistrationBoundary.call(this.#commands, assertExtensionCommand);
    return editor;
  }

  public addSheet(input: AddWorkbookSheetCommandInput): WorkbookCommandResult {
    const { activate = true, ...documentInput } = input;
    const add = (): WorkbookCommandResult => this.#executeStructuralTransaction('workbook.addSheet', (state) => ({
      documentState: addWorkbookSheet(state.documentState, documentInput),
      activeSheetId: activate ? input.sheet.id : state.activeSheetId,
    }));
    return activate
      ? this.#withSheetActivation({ sheetId: input.sheet.id },
        () => { addWorkbookSheet(this.#documentState, documentInput); }, add)
      : add();
  }

  public removeSheet(input: RemoveWorkbookSheetCommandInput): WorkbookCommandResult {
    return this.#executeStructuralTransaction('workbook.removeSheet', (state) => {
      const documentState = removeWorkbookSheet(state.documentState, { sheetId: input.sheetId });
      const activeSheetId =
        state.activeSheetId === input.sheetId
          ? chooseNextActiveSheet(state.documentState, documentState, input.sheetId, input.nextActiveSheetId)
          : state.activeSheetId;
      return { documentState, activeSheetId };
    });
  }

  public renameSheet(input: RenameWorkbookSheetCommandInput): WorkbookCommandResult {
    return this.#executeStructuralTransaction('workbook.renameSheet', (state) => {
      const previousName = getWorkbookSheetDescriptor(state.documentState, input.sheetId)?.name;
      const renamed = renameWorkbookSheet(state.documentState, input);
      const nextName = getWorkbookSheetDescriptor(renamed, input.sheetId)?.name;
      if (!previousName || !nextName) return { ...state, documentState: renamed };
      return { ...state, documentState: renameWorkbookFormulaObjectsSheet(renamed, previousName, nextName) };
    });
  }

  public activateSheet(input: ActivateWorkbookSheetCommandInput): WorkbookCommandResult {
    return this.#withSheetActivation(input, () => requireVisibleSheet(this.#documentState, input.sheetId), () => {
      const transaction = new WorkbookTransaction('workbook.activateSheet');
      transaction.addStep('workbook.activateSheet:select', (state) => {
        requireVisibleSheet(state.documentState, input.sheetId);
        return state.activeSheetId === input.sheetId ? state : { ...state, activeSheetId: input.sheetId };
      });
      return this.executeTransaction(transaction);
    });
  }

  #withSheetActivation(
    input: ActivateWorkbookSheetCommandInput,
    validateTarget: () => void,
    action: () => WorkbookCommandResult,
  ): WorkbookCommandResult {
    const changingSheet = this.#sessionStore.getActiveSheetId() !== input.sheetId;
    try {
      if (changingSheet) {
        validateTarget();
        this.#plugins.forEach((plugin) => plugin.onBeforeSheetActivation?.(input));
        const current = this.#requireActiveSheetEditor();
        if (current.queries.has(IsCellEditingQuery) && current.queries.run(IsCellEditingQuery, void 0)) {
          current.commands.run(CommitCellEditCommand, void 0);
          if (current.queries.run(IsCellEditingQuery, void 0)) {
            throw new SearError('Finish the current cell edit before switching sheets.');
          }
        }
      }
      return action();
    } catch (error) {
      if (changingSheet) {
        const platform = this.#container.resolve<Platform>(Platform.symbol);
        this.#plugins.forEach((plugin) => {
          try {
            plugin.onSheetActivationFailed?.(input);
          } catch (restoreError) {
            platform.warn('Workbook plugin failed to restore after sheet activation failed.', restoreError);
          }
        });
      }
      throw error;
    }
  }

  public moveSheet(input: MoveWorkbookSheetCommandInput): WorkbookCommandResult {
    return this.#executeStructuralTransaction('workbook.moveSheet', (state) => ({
      ...state,
      documentState: moveWorkbookSheet(state.documentState, input),
    }));
  }

  public hideSheet(input: HideWorkbookSheetCommandInput): WorkbookCommandResult {
    return this.#executeStructuralTransaction('workbook.hideSheet', (state) => {
      const documentState = setWorkbookSheetHidden(state.documentState, { sheetId: input.sheetId, hidden: true });
      const activeSheetId =
        state.activeSheetId === input.sheetId
          ? chooseVisibleSheet(documentState, input.nextActiveSheetId)
          : state.activeSheetId;
      return { documentState, activeSheetId };
    });
  }

  public unhideSheet(input: UnhideWorkbookSheetCommandInput): WorkbookCommandResult {
    return this.#executeStructuralTransaction('workbook.unhideSheet', (state) => ({
      ...state,
      documentState: setWorkbookSheetHidden(state.documentState, { sheetId: input.sheetId, hidden: false }),
    }));
  }

  public executeTransaction(transaction: WorkbookTransaction): WorkbookCommandResult {
    this.#assertLive();
    if (!this.#isCommandExecuting()) {
      throw new SearContractViolationError('Workbook transactions must run through editor.commands.run(...).', {
        transaction: transaction.id,
      });
    }
    const captured = this.#captureActiveRuntime();
    const before: WorkbookTransactionState = {
      documentState: captured.documentState,
      activeSheetId: this.#sessionStore.getActiveSheetId(),
    };
    const after = transaction.stage(before);
    validateWorkbookDocumentState(after.documentState);
    transaction.contentSheetIds.forEach((sheetId) => {
      if (!before.documentState.sheetStates[sheetId] || !after.documentState.sheetStates[sheetId]) {
        throw new SearError(`Workbook content history sheet "${sheetId}" must exist before and after the transaction.`);
      }
    });
    requireVisibleSheet(after.documentState, after.activeSheetId);
    const committedDocumentState = cloneWorkbookEditorDocumentState(after.documentState);
    lockCommittedSheetState(committedDocumentState);
    let beforeDocumentState = before.documentState;
    if (beforeDocumentState !== this.#documentState) {
      beforeDocumentState = cloneWorkbookEditorDocumentState(beforeDocumentState);
      lockCommittedSheetState(beforeDocumentState);
    }

    const activeSheetEditorChanged = after.activeSheetId !== before.activeSheetId ||
      after.documentState.sheetStates[after.activeSheetId] !== before.documentState.sheetStates[after.activeSheetId];
    const previousEditor = this.#requireActiveSheetEditor();
    const replacingActiveContent = activeSheetEditorChanged && after.activeSheetId === before.activeSheetId;
    if (replacingActiveContent) previousEditor.destroy();
    let nextEditor: SheetEditor | null = null;
    try {
      if (activeSheetEditorChanged) nextEditor = this.#createSheetEditor(
        after.activeSheetId,
        committedDocumentState,
        replacingActiveContent ? { state: captured.sessionState } : undefined,
      );
    } catch (error) {
      if (replacingActiveContent) this.#activeSheetEditor = this.#createSheetEditor(
        before.activeSheetId,
        before.documentState,
        { state: captured.sessionState },
      );
      throw error;
    }

    this.#documentState = committedDocumentState;
    this.#sessionStore.setSheetSessionState(captured.sheetId, captured.sessionState, this.#sessionLifecycleToken);
    this.#sessionStore.setActiveSheetId(after.activeSheetId, this.#sessionLifecycleToken);
    this.#sessionStore.removeMissingSheets(new Set(after.documentState.sheets.map((sheet) => sheet.id)), this.#sessionLifecycleToken);
    if (nextEditor) this.#activeSheetEditor = nextEditor;
    if (nextEditor && !replacingActiveContent) previousEditor.destroy();

    const event: WorkbookTransactionCommittedEvent = Object.freeze({
      transaction,
      before: Object.freeze({ documentState: beforeDocumentState, activeSheetId: before.activeSheetId }),
      after: Object.freeze({ documentState: committedDocumentState, activeSheetId: after.activeSheetId }),
    });
    this.#notifyTransactionCommitted(event);
    if (after.documentState !== before.documentState) {
      this.#documentStateListeners.forEach((listener) => listener(cloneWorkbookEditorDocumentState(this.#documentState)));
    }
    if (activeSheetEditorChanged) {
      const snapshot = this.#getActiveSheetEditorSnapshot();
      this.#activeSheetEditorListeners.forEach((listener) => listener(snapshot));
    }
    return this.createCommandResult(activeSheetEditorChanged);
  }

  #commitClipboardMove(input: CommitClipboardMoveInput): WorkbookCommandResult {
    const pending = this.#clipboardCutSession.getPending();
    const prepared = this.#preparedClipboardCut;
    if (!pending || pending.id !== input.cutId || pending.sourceId !== input.sourceId ||
      !prepared || prepared.id !== input.cutId || prepared.sourceId !== input.sourceId ||
      input.sourceId === input.targetId) {
      throw new SearError('The pending cross-sheet cut is no longer available.');
    }
    const currentSource = getWorkbookSheetState(this.#documentState, input.sourceId);
    if (!currentSource || JSON.stringify(serializeSheetDocumentState(currentSource)) !== prepared.sourceSignature) {
      this.#clipboardCutSession.cancel();
      this.#preparedClipboardCut = null;
      throw new SearError('The cut source changed before paste; cut was cancelled to preserve the newer edits.');
    }
    const transaction = new WorkbookTransaction(
      CommitClipboardMoveCommand.id, WorkbookHistoryAction.Record, [input.sourceId, input.targetId],
    );
    transaction.addStep(`${CommitClipboardMoveCommand.id}:move`, (state) => ({
      ...state,
      documentState: updateWorkbookSheetState(
        updateWorkbookSheetState(state.documentState, {
          sheetId: input.sourceId,
          sheetState: prepared.sourceAfter,
        }),
        { sheetId: input.targetId, sheetState: input.targetAfter },
      ),
    }));
    const result = this.executeTransaction(transaction);
    this.#clipboardCutSession.cancel();
    this.#preparedClipboardCut = null;
    return result;
  }

  public createCommandResult(activeSheetEditorChanged: boolean): WorkbookCommandResult {
    return { documentState: cloneWorkbookEditorDocumentState(this.#documentState), activeSheetEditorChanged };
  }

  public destroy(): void {
    if (this.#destroyed || this.#destroying) return;
    this.#destroying = true;
    try {
      if (this.#activeSheetEditor) {
        const captured = this.#captureActiveRuntime();
        this.#documentState = captured.documentState;
        this.#sessionStore.setSheetSessionState(captured.sheetId, captured.sessionState, this.#sessionLifecycleToken);
      }
      this.#destroyPlugins();
      this.#destroyed = true;
    } finally {
      this.#destroyed = true;
      try {
        this.#activeSheetEditor?.destroy();
        this.#activeSheetEditor = null;
      } finally {
        this.#observations.destroy();
        this.#commands.destroy();
        this.#extensions.destroy();
        this.#session.clear(this.#sessionLifecycleToken);
        this.#sessionStore.clear(this.#sessionLifecycleToken);
        this.#container.resolve<IFormulaExternalServiceProvider>(IFormulaExternalServiceProvider.symbol)
          .destroy(this.#formulaServiceTeardownToken);
        this.#container.reset();
        this.#destroying = false;
      }
    }
  }

  public destroyAfterFailedInitialization(): void {
    if (this.#destroyed || this.#destroying) return;
    this.#destroying = true;
    this.#destroyed = true;
    try {
      this.#destroyPlugins();
      this.#activeSheetEditor?.destroy();
    } finally {
      this.#activeSheetEditor = null;
      this.#extensions.destroy();
      this.#session.clear(this.#sessionLifecycleToken);
      this.#container.resolve<IFormulaExternalServiceProvider>(IFormulaExternalServiceProvider.symbol)
        .destroy(this.#formulaServiceTeardownToken);
      this.#container.reset();
      this.#destroying = false;
    }
  }

  #createPublicEditor(): WorkbookEditor {
    if (this.#publicEditor) return this.#publicEditor;
    const controller = this;
    this.#publicEditor = {
      commands: this.#commands,
      observations: this.#observations,
      services: createRuntimeCapabilityReader(this.#extensions, [
        WorkbookRuntimeCapability.Runtime,
        WorkbookRuntimeCapability.Session,
      ]),
      document: this.#publicDocument,
      sheets: this.#sheets,
      destroy: () => controller.destroy(),
    };
    return this.#publicEditor;
  }

  #createPluginRuntime(): WorkbookPluginRuntime {
    return {
      commands: this.#commands,
      observations: this.#observations,
      session: this.#session,
      extensions: this.#extensions,
      document: this.#document,
      sheets: this.#sheets,
      formula: {
        functions: this.#container.resolve<IFunctionRegistry>(IFunctionRegistry.symbol),
        textServices: this.#container.resolve<IFormulaTextServiceProvider>(IFormulaTextServiceProvider.symbol),
        externalServices: this.#container.resolve<IFormulaExternalServiceProvider>(
          IFormulaExternalServiceProvider.symbol,
        ),
        xmlXPath: this.#container.resolve<XmlXPathEvaluator>(XmlXPathEvaluator.symbol),
        webService: this.#container.resolve<WebServiceClient>(WebServiceClient.symbol),
      },
      executeTransaction: (transaction) => this.executeTransaction(transaction),
      createCommandResult: (changed) => this.createCommandResult(changed),
    };
  }

  #registerDefaultCapabilities(): void {
    this.#extensions.register(WorkbookRuntimeCapability.Platform, this.#container.resolve(Platform.symbol));
    this.#extensions.register(WorkbookRuntimeCapability.Commands, this.#commands);
    this.#extensions.register(WorkbookRuntimeCapability.Observations, this.#observations);
    this.#extensions.register(WorkbookRuntimeCapability.Session, this.#session);
    this.#extensions.register(WorkbookRuntimeCapability.Formula, this.#pluginRuntime.formula);
    this.#extensions.register(WorkbookRuntimeCapability.Runtime, this.#pluginRuntime);
  }

  #createPluginContext(): WorkbookPluginContext {
    return { container: this.#container, runtime: this.#pluginRuntime };
  }

  #initializePlugins(): void {
    const context = this.#createPluginContext();
    this.#plugins.forEach((plugin) => {
      const disposer = plugin.initialize?.(context);
      if (disposer) this.#pluginDisposers.push(disposer);
    });
  }

  #destroyPlugins(): void {
    const context = this.#createPluginContext();
    for (let index = this.#pluginDisposers.length - 1; index >= 0; index -= 1) {
      this.#pluginDisposers[index]?.();
    }
    this.#pluginDisposers.length = 0;
    for (let index = this.#plugins.length - 1; index >= 0; index -= 1) {
      this.#plugins[index]?.onWorkbookDestroy?.(context);
    }
  }

  #notifyTransactionCommitted(event: WorkbookTransactionCommittedEvent): void {
    const platform = this.#container.resolve<Platform>(Platform.symbol);
    this.#plugins.forEach((plugin) => {
      try {
        plugin.onTransactionCommitted?.(event);
      } catch (error) {
        platform.warn(`Workbook plugin transaction listener failed for ${event.transaction.id}.`, error);
      }
    });
  }

  #registerObservations(): void {
    this.#observations.register(WorkbookDocumentStateObservation, {
      getSnapshot: () => cloneWorkbookEditorDocumentState(this.#documentState),
      subscribe: (listener) =>
        this.#subscribe(this.#documentStateListeners, (state) => listener(cloneWorkbookEditorDocumentState(state))),
    });
    this.#observations.register(WorkbookActiveSheetEditorObservation, {
      getSnapshot: () => this.#getActiveSheetEditorSnapshot(),
      subscribe: (listener) => this.#subscribe(this.#activeSheetEditorListeners, listener),
    });
  }

  #executeStructuralTransaction(
    id: string,
    reducer: (state: WorkbookTransactionState) => WorkbookTransactionState,
  ): WorkbookCommandResult {
    const transaction = new WorkbookTransaction(id, WorkbookHistoryAction.Record);
    transaction.addStep(`${id}:stage`, reducer);
    return this.executeTransaction(transaction);
  }

  #exportDocumentState(): WorkbookDocumentState<SheetDocumentState> {
    this.#assertLive();
    return cloneWorkbookEditorDocumentState(this.#captureActiveRuntime().documentState);
  }

  #captureActiveRuntime(): {
    readonly sheetId: WorkbookSheetId;
    readonly documentState: WorkbookDocumentState<SheetDocumentState>;
    readonly sessionState: SheetSessionState | undefined;
  } {
    const sheetId = this.#sessionStore.getActiveSheetId();
    const editor = this.#requireActiveSheetEditor();
    const sheetState = getWorkbookSheetState(this.#documentState, sheetId);
    if (!sheetState) throw new SearError(`Workbook active sheet "${sheetId}" has no document state.`);
    const capturedSheetState = this.#captureSheetState({
      sheetId,
      editor,
      sheetState,
      documentState: this.#documentState,
    });
    const sessionState = this.#captureSheetSessionState({
      sheetId,
      editor,
      sessionState: this.#sessionStore.getSheetSessionState(sheetId),
    });
    return {
      sheetId,
      documentState:
        capturedSheetState === sheetState
          ? this.#documentState
          : updateWorkbookSheetState(this.#documentState, { sheetId, sheetState: capturedSheetState }),
      sessionState,
    };
  }

  #captureLiveSheetSession(): { readonly sheetId: WorkbookSheetId; readonly state?: SheetSessionState } {
    const sheetId = this.#sessionStore.getActiveSheetId();
    if (!this.#activeSheetEditor) {
      const stored = this.#sessionStore.getSheetSessionState(sheetId);
      return stored === void 0 ? { sheetId } : { sheetId, state: stored };
    }
    const state = this.#captureSheetSessionState({
      sheetId,
      editor: this.#activeSheetEditor,
      sessionState: this.#sessionStore.getSheetSessionState(sheetId),
    });
    return state === void 0 ? { sheetId } : { sheetId, state };
  }

  #createSheetEditor(
    sheetId: WorkbookSheetId,
    documentState: WorkbookDocumentState<SheetDocumentState>,
    sessionOverride?: { readonly state: SheetSessionState | undefined },
  ): SheetEditor {
    const sheetState = getWorkbookSheetState(documentState, sheetId);
    if (!sheetState) throw new SearError(`Workbook sheet "${sheetId}" has no document state.`);
    const plugins = [...(this.#configuration.sheetPlugins ?? [])];
    const services = new Map<symbol, unknown>([
      [IFormulaExternalServiceProvider.symbol, this.#pluginRuntime.formula.externalServices],
      [SheetFormatPainterSession.symbol, this.#formatPainterSession],
      [SheetClipboardCutSession.symbol, this.#clipboardCutSession],
      [SheetClipboardSheetIdentity.symbol, new SheetClipboardSheetIdentity(sheetId)],
      [SheetClipboardWorkbookBridgeSymbol, this.#createClipboardBridge(sheetId)],
      [SheetExternalHistory.symbol, this.#createExternalSheetHistory()],
    ]);
    const sessionState = sessionOverride ? sessionOverride.state : this.#sessionStore.getSheetSessionState(sheetId);
    const context = { ...this.#createPluginContext(), sheetId, sheetState };
    this.#plugins.forEach((plugin) => {
      const contributed = plugin.getSheetPlugins?.(context);
      if (contributed) plugins.push(...contributed);
      plugin.getSheetServices?.(context)?.forEach((service) => {
        if (services.has(service.token)) {
          throw new SearError(`Workbook Sheet service ${String(service.token)} is contributed more than once.`, {
            sheetId,
            token: String(service.token),
          });
        }
        services.set(service.token, service.value);
      });
    });
    services.set(FormulaRegistryOwnership.symbol, {
      functions: services.has(IFunctionRegistry.symbol),
      textServices: services.has(IFormulaTextServiceProvider.symbol),
      externalServices: true,
    });
    const adapters =
      services.size === 0
        ? this.#configuration.adapters
        : {
            ...this.#configuration.adapters,
            registerEnvironment: (container: Container): void => {
              this.#configuration.adapters.registerEnvironment?.(container);
              services.forEach((value, token) => {
                if (container.hasBinding(token)) {
                  throw new SearError(`Workbook Sheet service ${String(token)} conflicts with a host binding.`, {
                    sheetId,
                    token: String(token),
                  });
                }
                container.registerBorrowedInstance(token, value);
              });
            },
          };
    return this.#sheetEditorFactory({
      sheetId,
      configuration: {
        adapters,
        sheetState,
        ...(sessionState !== void 0 ? { sessionState } : {}),
        ...(this.#configuration.viewport ? { viewport: this.#configuration.viewport } : {}),
        ...(plugins.length > 0 ? { plugins } : {}),
      },
    });
  }

  #getActiveSheetEditorSnapshot(): WorkbookActiveSheetEditorSnapshot {
    return { sheetId: this.#sessionStore.getActiveSheetId(), editor: this.#requireActiveSheetEditor() };
  }

  #createClipboardBridge(sheetId: WorkbookSheetId): SheetClipboardWorkbookBridge {
    return {
      prepareCut: (cutId, sourceId, sourceBefore, clearedSource) => {
        if (sourceId !== sheetId) throw new SearError('Clipboard cut source does not match the mounted sheet.');
        this.#preparedClipboardCut = {
          id: cutId,
          sourceId,
          sourceSignature: JSON.stringify(serializeSheetDocumentState(sourceBefore)),
          sourceAfter: clearedSource,
        };
      },
      commitMove: async (cutId, sourceId, targetId, targetAfter) => {
        if (targetId !== sheetId) throw new SearError('Clipboard paste target does not match the mounted sheet.');
        this.#commands.run(CommitClipboardMoveCommand, { cutId, sourceId, targetId, targetAfter });
      },
    };
  }

  #createExternalSheetHistory(): SheetExternalHistory {
    const history = this.#container.resolve<WorkbookHistoryPlugin>(WorkbookHistoryPlugin.symbol);
    return {
      getStatus: () => ({ ...history.getStatus(), ...history.getOrderStatus() }),
      subscribe: (listener) => history.subscribe(listener),
      undo: () => { this.#commands.run(UndoWorkbookCommand, void 0); },
      redo: () => { this.#commands.run(RedoWorkbookCommand, void 0); },
      nextSequence: () => history.nextSequence(),
    };
  }

  #requireActiveSheetEditor(): SheetEditor {
    this.#assertLive();
    if (this.#activeSheetEditor) return this.#activeSheetEditor;
    throw new SearError('WorkbookEditor has not mounted its active SheetEditor.');
  }

  #subscribe<Value>(listeners: Set<(value: Value) => void>, listener: (value: Value) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  #assertLive(): void {
    if (this.#destroyed) throw new SearError('WorkbookEditor has been destroyed.');
  }
}

function registerWorkbookPluginImplementations(
  container: Container,
  implementations: readonly WorkbookPluginImplementation[],
): void {
  const symbols = new Set<symbol>();
  const context: WorkbookPluginServiceContext = { container };
  implementations.forEach((implementation) => {
    if (symbols.has(implementation.symbol)) {
      throw new SearError(`Workbook plugin DI token ${String(implementation.symbol)} is registered more than once.`);
    }
    symbols.add(implementation.symbol);
    implementation.registerServices?.(context);
    container.register(implementation.symbol, implementation, Scope.Singleton);
  });
}

function createDefaultSheetEditor(input: WorkbookSheetEditorFactoryInput): SheetEditor {
  return createSheetEditor(input.configuration);
}

function exportActiveSheetStateThroughCommand(input: WorkbookSheetStateCaptureInput): SheetDocumentState {
  if (typeof input.editor.commands.has !== 'function' || !input.editor.commands.has(ExportSheetStateCommand)) {
    return input.sheetState;
  }
  return input.editor.commands.run(ExportSheetStateCommand, void 0).sheetState;
}

function captureActiveSheetSessionStateThroughCommand(
  input: WorkbookSheetSessionStateCaptureInput,
): SheetSessionState | undefined {
  if (typeof input.editor.commands.has !== 'function' || !input.editor.commands.has(CaptureSheetSessionStateCommand)) {
    return input.sessionState;
  }
  return input.editor.commands.run(CaptureSheetSessionStateCommand, void 0).sessionState;
}

function requireVisibleSheet(documentState: WorkbookDocumentState<SheetDocumentState>, sheetId: WorkbookSheetId): void {
  const sheet = getWorkbookSheetDescriptor(documentState, sheetId);
  if (!sheet) throw new SearError(`Workbook sheet "${sheetId}" does not exist.`);
  if (sheet.hidden) throw new SearError(`Workbook sheet "${sheetId}" is hidden.`);
}

function chooseVisibleSheet(
  documentState: WorkbookDocumentState<SheetDocumentState>,
  preferred?: WorkbookSheetId,
): WorkbookSheetId {
  if (preferred) {
    requireVisibleSheet(documentState, preferred);
    return preferred;
  }
  return firstVisibleSheetId(documentState);
}

function chooseNextActiveSheet(
  previous: WorkbookDocumentState<SheetDocumentState>,
  next: WorkbookDocumentState<SheetDocumentState>,
  removedSheetId: WorkbookSheetId,
  preferred?: WorkbookSheetId,
): WorkbookSheetId {
  if (preferred) return chooseVisibleSheet(next, preferred);
  const removedIndex = previous.sheets.findIndex((sheet) => sheet.id === removedSheetId);
  const candidates = next.sheets.slice(Math.min(removedIndex, next.sheets.length - 1));
  return candidates.find((sheet) => !sheet.hidden)?.id ?? firstVisibleSheetId(next);
}
