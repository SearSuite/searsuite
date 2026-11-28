import {
  SheetPlugin,
  SheetQueryRegistry,
  type SheetCommandBus,
  type SheetEditor,
} from '@searsuite/sear-assembly-commands';
import {
  defineSessionState,
  Pipeline,
  PluginKey,
  readSessionState,
  runInsideCommandExecution,
  SessionStateRegistry,
  SessionStateRestorePhase,
  type PluginStateRegistration,
} from '@searsuite/sear-assembly-plugin';
import { type SheetEditorAdapters } from '@searsuite/sear-assembly-setup';
import { ExportSheetStateCommand } from '@searsuite/sear-assembly-sheet-kernel';
import {
  cloneSheetDocumentState,
  createEmptySheetDocumentState,
  type SheetDocumentState,
  type SheetSessionState,
} from '@searsuite/sear-assembly-sheet-state';
import {
  ActivateWorkbookSheetCommand,
  AddWorkbookSheetCommand,
  CaptureWorkbookSessionStateCommand,
  defineWorkbookCommand,
  defineWorkbookRuntimeCapability,
  ExportWorkbookStateCommand,
  HideWorkbookSheetCommand,
  MoveWorkbookSheetCommand,
  RecalculateWorkbookFormulasCommand,
  RedoWorkbookCommand,
  RemoveWorkbookDefinedNameCommand,
  RemoveWorkbookFormulaTableCommand,
  RemoveWorkbookSheetCommand,
  RenameWorkbookSheetCommand,
  SetWorkbookDefinedNameCommand,
  SetWorkbookFormulaTableCommand,
  UndoWorkbookCommand,
  UnhideWorkbookSheetCommand,
  WorkbookActiveSheetEditorObservation,
  WorkbookActiveSheetSessionStateDefinition,
  WorkbookCollaborationPlugin,
  WorkbookCommandBus,
  WorkbookDocumentStateObservation,
  WorkbookFormulaEvaluationRuntime,
  WorkbookFormulaObjectsObservation,
  WorkbookFormulaObjectsPlugin,
  WorkbookFormulaPlugin,
  WorkbookFormulaSheetTransactionObservation,
  WorkbookFormulaStateObservation,
  WorkbookHistoryAction,
  WorkbookHistoryPlugin,
  WorkbookHistoryStatusObservation,
  WorkbookPlugin,
  WorkbookSessionStore,
  WorkbookSheetSessionsStateDefinition,
  WorkbookTransaction,
  type WorkbookCommandDefinition,
  type WorkbookCommandResult,
  type WorkbookCompanionSheetPluginContext,
  type WorkbookPluginContext,
  type WorkbookPluginServiceContext,
  type WorkbookTransactionCommittedEvent,
} from '@searsuite/sear-assembly-workbook-kernel';
import { MatrixOT, MatrixOTActionName } from '@searsuite/sear-domain-ot';
import { ReadSheetCellDataQuery, SheetMatrix } from '@searsuite/sear-domain-sheet';
import { createTransaction, Transaction } from '@searsuite/sear-domain-transaction';
import { createWorkbookDocumentState } from '@searsuite/sear-domain-workbook';
import { Inject, Injectable, Scope } from '@searsuite/sear-foundation-di';
import { defineStateObservation, ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { HeadlessCollabTransport } from '@searsuite/sear-plugin-collab';
import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { createWorkbookEditor, type WorkbookSheetEditorFactoryInput } from '../src';

import { CommandExecutionPhase } from '@searsuite/sear-foundation-common';

import { CellType } from '@searsuite/sear-domain-cell-types';
import {
  FormulaAddInServiceDefinition,
  IFormulaExternalServiceProvider,
  IFormulaTextServiceProvider,
  IFunctionRegistry,
} from '@searsuite/sear-domain-formula-engine';

interface TestSheetState extends SheetDocumentState {
  readonly label: string;
}

interface RecordedSheetEditor extends SheetEditor {
  readonly sheetId: string;
  readonly sheetState: SheetDocumentState;
  readonly destroyCount: () => number;
}

function createSheetState(label: string): TestSheetState {
  return { label } as TestSheetState;
}

function createWorkbook() {
  return createWorkbookDocumentState<SheetDocumentState>({
    id: 'book-1',
    sheets: [
      { id: 'sheet-1', name: 'One' },
      { id: 'sheet-2', name: 'Two' },
    ],
    sheetStates: {
      'sheet-1': createSheetState('one'),
      'sheet-2': createSheetState('two'),
    },
  });
}

function createFormulaWorkbook() {
  const state = createWorkbook();
  return {
    ...state,
    sheetStates: Object.fromEntries(
      state.sheets.map((sheet) => [
        sheet.id,
        { ...state.sheetStates[sheet.id], sheetData: new SheetMatrix(void 0, [2, 2]) },
      ]),
    ),
  };
}

function createSessionState(row: number): SheetSessionState {
  return { 'test.session': { row } };
}

function createSheetQueries(sheetState: SheetDocumentState): SheetQueryRegistry {
  const queries = new SheetQueryRegistry();
  if (sheetState.sheetData) queries.register(ReadSheetCellDataQuery, () => sheetState.sheetData);
  return queries;
}

function createFakeFactory() {
  const created: RecordedSheetEditor[] = [];
  const factory = (input: WorkbookSheetEditorFactoryInput): SheetEditor => {
    let destroyed = 0;
    const editor: RecordedSheetEditor = {
      sheetId: input.sheetId,
      sheetState: input.configuration.sheetState,
      commands: {} as SheetCommandBus,
      queries: createSheetQueries(input.configuration.sheetState),
      observations: {} as SheetEditor['observations'],
      services: {} as SheetEditor['services'],
      destroy(): void {
        destroyed += 1;
      },
      destroyCount(): number {
        return destroyed;
      },
    };
    created.push(editor);
    return editor;
  };
  return { created, factory };
}

const adapters = {
  platform: class WorkbookTestPlatform {
    public warn(): void {}
  },
} as unknown as SheetEditorAdapters;

const ThirdPartyWorkbookCommand = defineWorkbookCommand<void, string>('thirdPartyWorkbook.probe');
const ThirdPartyWorkbookObservation = defineStateObservation<readonly string[]>('thirdPartyWorkbook.names');

class ThirdPartyCompanionSheetPlugin extends SheetPlugin<null> {
  public static readonly symbol = Symbol('ThirdPartyCompanionSheetPlugin');

  public constructor() {
    super({ key: new PluginKey('thirdPartyCompanionSheet'), state: null });
  }

  public apply(pluginState: null, _transaction: Transaction): null {
    return pluginState;
  }

  public registerState(): PluginStateRegistration<null> {
    return { key: this.key, state: null, dataEngine: { enabled: false } };
  }
}

class ConfiguredSheetPlugin extends SheetPlugin<null> {
  public static readonly symbol = Symbol('ConfiguredSheetPlugin');

  public constructor() {
    super({ key: new PluginKey('configuredSheetPlugin'), state: null });
  }

  public apply(pluginState: null, _transaction: Transaction): null {
    return pluginState;
  }

  public registerState(): PluginStateRegistration<null> {
    return { key: this.key, state: null, dataEngine: { enabled: false } };
  }
}

describe('createWorkbookEditor', () => {
  it('guards retained workbook session storage and detaches sheet session values', () => {
    const store = new WorkbookSessionStore(createWorkbook());
    const lifecycleToken = {};
    let executing = false;
    store.enforceCommandBoundary(() => executing, lifecycleToken);
    const source = createSessionState(1);

    expect(() => store.setActiveSheetId('sheet-2')).toThrow('command');
    expect(() => store.setSheetSessionState('sheet-1', source)).toThrow('command');
    expect(() => store.removeMissingSheets(new Set(['sheet-1']))).toThrow('command');
    expect(() => store.bindActiveSheetCapture(() => ({ sheetId: 'sheet-1' }))).toThrow('already bound');
    executing = true;
    expect(() => store.setActiveSheetId('sheet-2')).toThrow('command');
    store.setSheetSessionState('sheet-1', source, lifecycleToken);
    store.setActiveSheetId('sheet-2', lifecycleToken);
    executing = false;

    (source['test.session'] as { row: number }).row = 9;
    const read = store.getSheetSessionState('sheet-1')!;
    (read['test.session'] as { row: number }).row = 8;
    expect(store.getSheetSessionState('sheet-1')).toEqual(createSessionState(1));
    expect(store.getActiveSheetId()).toBe('sheet-2');
    expect(() => store.clear()).toThrow();
    store.clear(lifecycleToken);
  });

  it('seals retained workbook session adapters and detaches their captures', () => {
    const store = new WorkbookSessionStore(createWorkbook());
    const adapters = new Map<string, { capture(): unknown; restore(state: unknown): void }>();
    store.registerSessionState({
      register: (definition: { id: string }, adapter: { capture(): unknown; restore(state: unknown): void }) => {
        adapters.set(definition.id, adapter);
        return () => {};
      },
    } as unknown as SessionStateRegistry);
    const active = adapters.get(WorkbookActiveSheetSessionStateDefinition.id)!;
    const sheets = adapters.get(WorkbookSheetSessionsStateDefinition.id)!;
    sheets.restore({ 'sheet-1': createSessionState(1) });
    store.enforceCommandBoundary(() => false, {});

    const captured = sheets.capture() as Record<string, SheetSessionState>;
    (captured['sheet-1']['test.session'] as { row: number }).row = 8;
    expect(store.getSheetSessionState('sheet-1')).toEqual(createSessionState(1));
    expect(() => active.restore('sheet-2')).toThrow('restoration is closed');
    expect(() => sheets.restore({ 'sheet-1': createSessionState(2) })).toThrow('restoration is closed');
    expect(() => store.registerSessionState({ register: jest.fn() } as never)).toThrow('registration is closed');
    expect(Reflect.get(store, 'restoreSheetSessions')).toBeUndefined();
    expect(Reflect.get(store, 'assertWritable')).toBeUndefined();
    expect(store.getActiveSheetId()).toBe('sheet-1');
  });

  it('seals a workbook plugin-retained session store after editor assembly', () => {
    let retained: WorkbookSessionStore | null = null;
    @Injectable()
    class SessionStoreProbePlugin extends WorkbookPlugin {
      public static readonly symbol = Symbol('SessionStoreProbePlugin');
      public initialize(context: WorkbookPluginContext): void {
        retained = context.container.resolve<WorkbookSessionStore>(WorkbookSessionStore.symbol);
      }
    }
    const { factory } = createFakeFactory();
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      sheetEditorFactory: factory,
      plugins: [SessionStoreProbePlugin],
    });
    try {
      expect(retained).not.toBeNull();
      expect(() => retained!.setActiveSheetId('sheet-2')).toThrow('editor.commands.run');
      expect(() => retained!.setSheetSessionState('sheet-1', createSessionState(2))).toThrow('editor.commands.run');
      expect(() => {
        (retained as unknown as { activeSheetId: string }).activeSheetId = 'sheet-2';
      }).toThrow();
      expect(retained!.getActiveSheetId()).toBe('sheet-1');
      editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-2' });
      expect(retained!.getActiveSheetId()).toBe('sheet-2');
    } finally {
      editor.destroy();
    }
  });

  it('runs workbook lifecycle observers without mutation authority', () => {
    const commands = new WorkbookCommandBus();
    const observed: Array<[CommandExecutionPhase, boolean]> = [];
    commands.subscribe((event) => observed.push([event.phase, commands.isExecuting()]));
    const Success = defineWorkbookCommand<void, number>('workbook.lifecycle.success');
    const Failure = defineWorkbookCommand<void, number>('workbook.lifecycle.failure');
    commands.register(Success, () => 1);
    commands.register(Failure, () => {
      throw new Error('failed');
    });

    expect(commands.run(Success, void 0)).toBe(1);
    expect(() => commands.run(Failure, void 0)).toThrow('failed');
    expect(observed).toEqual([
      [CommandExecutionPhase.Started, false],
      [CommandExecutionPhase.Completed, false],
      [CommandExecutionPhase.Started, false],
      [CommandExecutionPhase.Failed, false],
    ]);
    expect(commands.isExecuting()).toBe(false);
  });

  it('does not let a workbook listener forge this bus write authority', () => {
    const commands = new WorkbookCommandBus();
    const Command = defineWorkbookCommand('workbook.lifecycle.forgedScope');
    const observed: boolean[] = [];
    commands.register(Command, () => void 0);
    commands.subscribe((event) => {
      if (event.phase !== CommandExecutionPhase.Completed) return;
      runInsideCommandExecution('forged', () => observed.push(commands.isExecuting()));
    });

    commands.run(Command, void 0);

    expect(observed).toEqual([false]);
  });

  it('locks retained workbook command definitions', () => {
    const commands = new WorkbookCommandBus();
    const definition = { id: 'workbook.retainedDefinition' } as WorkbookCommandDefinition<void, void>;
    commands.register(definition, () => void 0);
    expect(() => {
      (definition as { id: string }).id = 'changed';
    }).toThrow();
  });

  it('reports asynchronous workbook command completion and failure after settlement', async () => {
    const commands = new WorkbookCommandBus();
    const Success = defineWorkbookCommand<void, Promise<number>>('workbook.lifecycle.asyncSuccess');
    const Failure = defineWorkbookCommand<void, Promise<number>>('workbook.lifecycle.asyncFailure');
    const phases: Array<[string, CommandExecutionPhase]> = [];
    let resolve!: (value: number) => void;
    let reject!: (reason: Error) => void;
    const success = new Promise<number>((finish) => {
      resolve = finish;
    });
    const failure = new Promise<number>((_, fail) => {
      reject = fail;
    });
    commands.subscribe((event) => phases.push([event.id, event.phase]));
    commands.register(Success, () => success);
    commands.register(Failure, () => failure);

    const successResult = commands.run(Success, void 0);
    const failureResult = commands.run(Failure, void 0);
    expect(phases).toEqual([
      [Success.id, CommandExecutionPhase.Started],
      [Failure.id, CommandExecutionPhase.Started],
    ]);
    resolve(7);
    expect(await successResult).toBe(7);
    reject(new Error('connection failed'));
    await expect(failureResult).rejects.toThrow('connection failed');
    expect(phases).toEqual([
      [Success.id, CommandExecutionPhase.Started],
      [Failure.id, CommandExecutionPhase.Started],
      [Success.id, CommandExecutionPhase.Completed],
      [Failure.id, CommandExecutionPhase.Failed],
    ]);
    expect(commands.isExecuting()).toBe(false);
  });

  it('isolates workbook command lifecycle listener failures', () => {
    const warn = jest.fn();
    const commands = new WorkbookCommandBus({ warn });
    const Command = defineWorkbookCommand<void, number>('workbook.listenerIsolation');
    const observed: CommandExecutionPhase[] = [];
    commands.subscribe(() => {
      throw new Error('listener failed');
    });
    commands.subscribe((event) => observed.push(event.phase));
    commands.register(Command, () => 42);

    expect(commands.run(Command, void 0)).toBe(42);
    expect(observed).toEqual([CommandExecutionPhase.Started, CommandExecutionPhase.Completed]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('WorkbookCommandBus listener failed during completed:workbook.listenerIsolation'),
      expect.any(Error),
    );
  });

  it('preserves workbook handler failures when lifecycle listeners throw', () => {
    const warn = jest.fn();
    const commands = new WorkbookCommandBus({ warn });
    const Command = defineWorkbookCommand('workbook.handlerFailure');
    const events: CommandExecutionPhase[] = [];
    commands.subscribe(() => {
      throw new Error('observer failed');
    });
    commands.subscribe((event) => events.push(event.phase));
    commands.register(Command, () => {
      throw new Error('handler failed');
    });

    expect(() => commands.run(Command, void 0)).toThrow('handler failed');
    expect(commands.isExecuting()).toBe(false);
    expect(events).toEqual([CommandExecutionPhase.Started, CommandExecutionPhase.Failed]);
    expect(warn).toHaveBeenCalledTimes(2);
    commands.destroy();
    expect(() => commands.run(Command, void 0)).toThrow('has been destroyed');
  });
  it('does not accept a forged workbook command execution depth', () => {
    const commands = new WorkbookCommandBus();
    (commands as unknown as { executionDepth: number }).executionDepth = 1;
    expect(Reflect.set(commands, 'isExecuting', () => true)).toBe(false);
    expect((commands as unknown as Record<string, unknown>)['registrations']).toBeUndefined();
    expect(commands.isExecuting()).toBe(false);
  });

  it('closes Workbook session restoration after initialization', () => {
    let retainedSession: SessionStateRegistry | null = null;
    @Injectable()
    class SessionProbePlugin extends WorkbookPlugin {
      public static readonly symbol = Symbol('SessionProbePlugin');
      public initialize(context: WorkbookPluginContext): void {
        retainedSession = context.runtime.session;
      }
    }
    const { factory } = createFakeFactory();
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      sheetEditorFactory: factory,
      plugins: [SessionProbePlugin],
    });
    try {
      expect(() => retainedSession!.loadSnapshot({})).toThrow();
      expect(() => retainedSession!.restorePhase(SessionStateRestorePhase.BeforeInitialize)).toThrow();
      expect(() => retainedSession!.clear()).toThrow();
    } finally {
      editor.destroy();
    }
  });
  it('keeps workbook history stacks private from a plugin-retained instance', () => {
    let retainedHistory: WorkbookHistoryPlugin | null = null;
    const retainedHistorySession = new SessionStateRegistry();
    @Injectable()
    class RetainHistoryPlugin extends WorkbookPlugin {
      readonly #history: WorkbookHistoryPlugin;

      public static readonly symbol = Symbol('RetainHistoryPlugin');
      public constructor(
        @Inject(WorkbookHistoryPlugin.symbol)
        history: WorkbookHistoryPlugin,
      ) {
        super();
        this.#history = history;
      }
      public registerSessionState(): void {
        this.#history.registerSessionState(retainedHistorySession);
      }
      public initialize(context: WorkbookPluginContext): void {
        retainedHistory = context.container.resolve<WorkbookHistoryPlugin>(WorkbookHistoryPlugin.symbol);
      }
    }
    const { factory } = createFakeFactory();
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      sheetEditorFactory: factory,
      plugins: [RetainHistoryPlugin],
    });
    try {
      expect(retainedHistory).not.toBeNull();
      expect((retainedHistory as unknown as { undoStack?: unknown }).undoStack).toBeUndefined();
      editor.commands.run(AddWorkbookSheetCommand, {
        sheet: { id: 'sheet-3', name: 'Three' },
        sheetState: createSheetState('three'),
        activate: false,
      });
      expect(retainedHistory!.getStatus().canUndo).toBe(true);
      const current = {
        documentState: editor.document.getState(),
        activeSheetId: editor.sheets.getActiveId(),
      };
      expect(() =>
        retainedHistory!.onTransactionCommitted({
          transaction: new WorkbookTransaction('forged-history', WorkbookHistoryAction.Undo),
          before: current,
          after: current,
        }),
      ).toThrow('editor.commands.run');
      expect(retainedHistory!.getStatus()).toEqual({ canUndo: true, canRedo: false });
      expect(() => retainedHistory!.onWorkbookDestroy()).toThrow('editor.commands.run');
      expect(() =>
        Object.defineProperty(retainedHistory, 'assertRuntimeWriteAllowed', { value: () => void 0 }),
      ).toThrow();
      expect(() => WorkbookHistoryPlugin.prototype.onWorkbookDestroy.call(retainedHistory!)).toThrow(
        'editor.commands.run',
      );
      expect(() => retainedHistory!.registerSessionState(new SessionStateRegistry())).toThrow('restoration is closed');
      retainedHistorySession.loadSnapshot({ 'workbook.history': { undoStack: [], redoStack: [] } });
      expect(() => retainedHistorySession.restorePhase(SessionStateRestorePhase.BeforeInitialize)).toThrow(
        'restoration is closed',
      );
      expect(retainedHistory!.getStatus()).toEqual({ canUndo: true, canRedo: false });
      (retainedHistory as unknown as { undoStack: unknown[] }).undoStack = [];
      (retainedHistory as unknown as { redoStack: unknown[] }).redoStack = [{}];
      expect(retainedHistory!.getStatus()).toEqual({ canUndo: true, canRedo: false });
      editor.commands.run(UndoWorkbookCommand, void 0);
      expect(editor.document.getState().sheets.map((sheet) => sheet.id)).toEqual(['sheet-1', 'sheet-2']);
    } finally {
      editor.destroy();
    }
  });

  it('keeps workbook-owned formula services alive until workbook teardown', () => {
    let retainedServices: IFormulaExternalServiceProvider | null = null;

    @Injectable()
    class RetainServicesPlugin extends WorkbookPlugin {
      public static readonly symbol = Symbol('RetainServicesPlugin');
      public initialize(context: WorkbookPluginContext): void {
        retainedServices = context.runtime.formula.externalServices;
      }
    }

    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      plugins: [RetainServicesPlugin],
      sheetEditorFactory: createFakeFactory().factory,
    });
    try {
      expect(retainedServices!.get(FormulaAddInServiceDefinition)).toBeDefined();
      expect(() => retainedServices!.destroy()).toThrow('editor owner');
      expect(retainedServices!.get(FormulaAddInServiceDefinition)).toBeDefined();
    } finally {
      editor.destroy();
    }
  });

  it('rejects forged callbacks on retained Workbook plugins', () => {
    let objects: WorkbookFormulaObjectsPlugin | null = null;
    let collaboration: WorkbookCollaborationPlugin | null = null;
    @Injectable()
    class RetainPlugins extends WorkbookPlugin {
      public static readonly symbol = Symbol('RetainPlugins');
      public initialize(context: WorkbookPluginContext): void {
        objects = context.container.resolve<WorkbookFormulaObjectsPlugin>(WorkbookFormulaObjectsPlugin.symbol);
        collaboration = context.container.resolve<WorkbookCollaborationPlugin>(WorkbookCollaborationPlugin.symbol);
      }
    }
    const { factory } = createFakeFactory();
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters: { ...adapters, collabTransport: HeadlessCollabTransport },
      sheetEditorFactory: factory,
      plugins: [RetainPlugins],
    });
    try {
      const current = {
        documentState: editor.document.getState(),
        activeSheetId: editor.sheets.getActiveId(),
      };
      Object.assign(objects!, { runtime: { commands: { isExecuting: () => true } } });
      expect(() => objects!.onTransactionCommitted()).toThrow('editor.commands.run');
      expect(() =>
        collaboration!.onTransactionCommitted({
          transaction: new WorkbookTransaction('forged', WorkbookHistoryAction.Record),
          before: current,
          after: current,
        }),
      ).toThrow('editor.commands.run');
    } finally {
      editor.destroy();
    }
  });

  it('edits formula names and tables through workbook commands with history', () => {
    const { factory } = createFakeFactory();
    const editor = createWorkbookEditor({ documentState: createWorkbook(), adapters, sheetEditorFactory: factory });
    const observed: unknown[] = [];
    const dispose = editor.observations.subscribe(WorkbookFormulaObjectsObservation, (value) => observed.push(value));

    editor.commands.run(SetWorkbookDefinedNameCommand, { name: 'Rate', formula: '=One!B1' });
    editor.commands.run(SetWorkbookFormulaTableCommand, {
      name: 'Sales',
      sheet: 'Two',
      range: 'A1:B3',
      headers: true,
    });
    expect(editor.observations.getSnapshot(WorkbookFormulaObjectsObservation)).toEqual({
      names: { Rate: '=One!B1' },
      tables: [{ name: 'Sales', sheet: 'Two', range: 'A1:B3', headers: true }],
    });
    expect(observed).toHaveLength(3);
    editor.commands.run(RemoveWorkbookDefinedNameCommand, { name: 'RATE' });
    editor.commands.run(RemoveWorkbookFormulaTableCommand, { name: 'sales' });
    expect(editor.observations.getSnapshot(WorkbookFormulaObjectsObservation)).toEqual({ names: {}, tables: [] });
    editor.commands.run(UndoWorkbookCommand, void 0);
    expect(editor.observations.getSnapshot(WorkbookFormulaObjectsObservation)).toMatchObject({
      tables: [{ name: 'Sales' }],
    });
    expect(() => editor.commands.run(SetWorkbookDefinedNameCommand, { name: 'A1', formula: '=1' })).toThrow();
    expect(() =>
      editor.commands.run(SetWorkbookFormulaTableCommand, {
        name: 'Bad',
        sheet: 'Missing',
        range: 'A1:B2',
        headers: true,
      }),
    ).toThrow();
    dispose();
    editor.destroy();
  });

  it('keeps defined names and table references valid across sheet rename and undo', () => {
    const { factory } = createFakeFactory();
    const editor = createWorkbookEditor({ documentState: createWorkbook(), adapters, sheetEditorFactory: factory });
    editor.commands.run(SetWorkbookDefinedNameCommand, { name: 'Rate', formula: '=Two!B1' });
    editor.commands.run(SetWorkbookDefinedNameCommand, { name: 'Across', formula: '=SUM(One:Two!B1)' });
    editor.commands.run(SetWorkbookFormulaTableCommand, {
      name: 'Sales',
      sheet: 'Two',
      range: 'A1:B3',
      headers: true,
    });

    editor.commands.run(RenameWorkbookSheetCommand, { sheetId: 'sheet-2', name: 'Sales Data' });
    expect(editor.observations.getSnapshot(WorkbookFormulaObjectsObservation)).toEqual({
      names: { Rate: "='Sales Data'!B1", Across: "=SUM('One:Sales Data'!B1)" },
      tables: [{ name: 'Sales', sheet: 'Sales Data', range: 'A1:B3', headers: true }],
    });
    expect(
      new WorkbookFormulaEvaluationRuntime().compileFormula(
        { sheetId: 'sheet-1', row: 0, col: 0 },
        '=Across',
        editor.document.getState(),
      ).dependencies,
    ).toEqual([
      { sheetId: 'sheet-1', row: 0, col: 1 },
      { sheetId: 'sheet-2', row: 0, col: 1 },
    ]);

    editor.commands.run(UndoWorkbookCommand, void 0);
    expect(editor.observations.getSnapshot(WorkbookFormulaObjectsObservation)).toEqual({
      names: { Rate: '=Two!B1', Across: '=SUM(One:Two!B1)' },
      tables: [{ name: 'Sales', sheet: 'Two', range: 'A1:B3', headers: true }],
    });
    editor.destroy();
  });

  it('groups workbook document and sheet access without legacy top-level getters', () => {
    const { created, factory } = createFakeFactory();
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      sheetEditorFactory: factory,
    });

    expect(Object.keys(editor).sort()).toEqual(
      ['services', 'commands', 'destroy', 'document', 'observations', 'sheets'].sort(),
    );
    expect(editor.document.getState().id).toBe('book-1');
    expect(editor.sheets.getActiveId()).toBe('sheet-1');
    expect(editor.sheets.getActiveEditor()).toBe(created[0]);
    expect(editor).not.toHaveProperty('getDocumentState');
    expect(editor).not.toHaveProperty('getActiveSheetId');
    expect(editor).not.toHaveProperty('getActiveSheetEditor');
    expect(editor).not.toHaveProperty('getSheetEditor');

    editor.destroy();
  });

  it('captures and restores SheetSessionState by sheet id when switching tabs', () => {
    const mountedSessions: Array<{ sheetId: string; sessionState: SheetSessionState | undefined }> = [];
    const captured = new Map<string, SheetSessionState>([
      ['sheet-1', createSessionState(1)],
      ['sheet-2', createSessionState(2)],
    ]);
    const factory = (input: WorkbookSheetEditorFactoryInput): SheetEditor => {
      mountedSessions.push({ sheetId: input.sheetId, sessionState: input.configuration.sessionState });
      return {
        commands: {} as SheetCommandBus,
        queries: createSheetQueries(input.configuration.sheetState),
        observations: {} as SheetEditor['observations'],
        services: {} as SheetEditor['services'],
        destroy(): void {},
      };
    };
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      sheetEditorFactory: factory,
      captureSheetSessionState: ({ sheetId }) => captured.get(sheetId),
      captureSheetState: ({ sheetState }) => sheetState,
    });

    editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-2' });
    editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-1' });

    expect(mountedSessions).toEqual([
      { sheetId: 'sheet-1', sessionState: undefined },
      { sheetId: 'sheet-2', sessionState: undefined },
      { sheetId: 'sheet-1', sessionState: captured.get('sheet-1') },
    ]);
    const sessionState = editor.commands.run(CaptureWorkbookSessionStateCommand, void 0).sessionState;
    expect(readSessionState(sessionState, WorkbookSheetSessionsStateDefinition)).toEqual({
      'sheet-1': captured.get('sheet-1'),
      'sheet-2': captured.get('sheet-2'),
    });
    editor.destroy();
  });

  it('mounts one live SheetEditor for the active workbook sheet', () => {
    const { created, factory } = createFakeFactory();
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      sheetEditorFactory: factory,
    });

    expect(created.map((sheetEditor) => sheetEditor.sheetId)).toEqual(['sheet-1']);
    expect(editor.sheets.getActiveId()).toBe('sheet-1');
    expect(editor.sheets.getActiveEditor()).toBe(created[0]);
    expect(editor.sheets.getEditor('sheet-1')).toBe(created[0]);
    expect(editor.sheets.getEditor('sheet-2')).toBeNull();

    editor.destroy();
  });

  it('adds inactive sheets without replacing the live SheetEditor', () => {
    const { created, factory } = createFakeFactory();
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      sheetEditorFactory: factory,
    });

    const result = editor.commands.run(AddWorkbookSheetCommand, {
      sheet: { id: 'sheet-3', name: 'Three' },
      sheetState: createSheetState('three'),
      activate: false,
    });

    expect(result.activeSheetEditorChanged).toBe(false);
    expect(created).toHaveLength(1);
    expect(editor.document.getState().sheets.map((sheet) => sheet.id)).toEqual(['sheet-1', 'sheet-2', 'sheet-3']);
    expect(editor.sheets.getActiveId()).toBe('sheet-1');

    editor.destroy();
  });

  it('activates sheets by destroying the old editor and mounting the new active sheet', () => {
    const { created, factory } = createFakeFactory();
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      sheetEditorFactory: factory,
    });

    const result = editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-2' });

    expect(result.activeSheetEditorChanged).toBe(true);
    expect(created.map((sheetEditor) => sheetEditor.sheetId)).toEqual(['sheet-1', 'sheet-2']);
    expect(created[0]?.destroyCount()).toBe(1);
    expect(editor.sheets.getActiveEditor()).toBe(created[1]);
    expect(editor.sheets.getEditor('sheet-1')).toBeNull();

    editor.destroy();
  });

  it('captures active sheet state before workbook lifecycle transitions', () => {
    const { created, factory } = createFakeFactory();
    const capturedState = createSheetState('captured-one');
    const capturedSheetIds: string[] = [];
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      sheetEditorFactory: factory,
      captureSheetState(input) {
        capturedSheetIds.push(input.sheetId);
        if (input.sheetId === 'sheet-1') {
          expect(input.editor).toBe(created[0]);
          return capturedState;
        }
        return input.sheetState;
      },
    });

    editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-2' });

    expect(editor.document.getState().sheetStates['sheet-1']).toEqual(capturedState);
    editor.destroy();
    expect(capturedSheetIds).toEqual(['sheet-1', 'sheet-2']);
  });

  it('captures active sheet state through the formal sheet export command by default', () => {
    const exportedState = createSheetState('exported-one');
    const exportCalls: string[] = [];
    const factory = (input: WorkbookSheetEditorFactoryInput): SheetEditor => {
      const commands = {
        has(command: { readonly id: string }) {
          return command.id === ExportSheetStateCommand.id;
        },
        run(command: { readonly id: string }) {
          exportCalls.push(`${input.sheetId}:${command.id}`);
          return { pipeline: new Pipeline(command.id), sheetState: exportedState };
        },
      } as unknown as SheetCommandBus;
      return {
        commands,
        queries: createSheetQueries(input.configuration.sheetState),
        observations: {} as SheetEditor['observations'],
        services: {} as SheetEditor['services'],
        destroy(): void {},
      };
    };
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      sheetEditorFactory: factory,
    });

    editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-2' });

    expect(exportCalls).toEqual(['sheet-1:sheet.exportState']);
    expect(editor.document.getState().sheetStates['sheet-1']).toEqual(exportedState);
    editor.destroy();
  });

  it('removes and hides the active sheet by mounting the next active sheet', () => {
    const { created, factory } = createFakeFactory();
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      sheetEditorFactory: factory,
    });

    const removed = editor.commands.run(RemoveWorkbookSheetCommand, { sheetId: 'sheet-1' });
    expect(removed.activeSheetEditorChanged).toBe(true);
    expect(editor.sheets.getActiveId()).toBe('sheet-2');
    expect(created.map((sheetEditor) => sheetEditor.sheetId)).toEqual(['sheet-1', 'sheet-2']);

    editor.commands.run(AddWorkbookSheetCommand, {
      sheet: { id: 'sheet-3', name: 'Three' },
      sheetState: createSheetState('three'),
    });
    const hidden = editor.commands.run(HideWorkbookSheetCommand, {
      sheetId: 'sheet-3',
      nextActiveSheetId: 'sheet-2',
    });

    expect(hidden.activeSheetEditorChanged).toBe(true);
    expect(editor.sheets.getActiveId()).toBe('sheet-2');
    expect(editor.document.getState().sheets.find((sheet) => sheet.id === 'sheet-3')?.hidden).toBe(true);

    editor.commands.run(UnhideWorkbookSheetCommand, { sheetId: 'sheet-3' });
    expect(editor.document.getState().sheets.find((sheet) => sheet.id === 'sheet-3')?.hidden).toBeUndefined();

    editor.destroy();
  });

  it('renames and moves sheets without replacing the live SheetEditor', () => {
    const { created, factory } = createFakeFactory();
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      sheetEditorFactory: factory,
    });

    editor.commands.run(RenameWorkbookSheetCommand, { sheetId: 'sheet-2', name: ' Data ' });
    const moved = editor.commands.run(MoveWorkbookSheetCommand, { sheetId: 'sheet-2', toIndex: 0 });

    expect(moved.activeSheetEditorChanged).toBe(false);
    expect(created).toHaveLength(1);
    expect(editor.document.getState().sheets.map((sheet) => `${sheet.id}:${sheet.name}`)).toEqual([
      'sheet-2:Data',
      'sheet-1:One',
    ]);

    editor.destroy();
  });

  it('emits workbook command lifecycle events and tears down idempotently', () => {
    const { created, factory } = createFakeFactory();
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      sheetEditorFactory: factory,
    });
    const events: string[] = [];
    editor.commands.subscribe((event) => events.push(`${event.phase}:${event.id}`));

    editor.commands.run(RenameWorkbookSheetCommand, { sheetId: 'sheet-1', name: 'Start' });

    expect(events).toEqual(['started:workbook.renameSheet', 'completed:workbook.renameSheet']);
    expect(editor.commands.getRegisteredCommandIds()).toEqual([
      'workbook.activateSheet',
      'workbook.addSheet',
      'workbook.captureSessionState',
      'workbook.clipboard.commitMove',
      'workbook.exportState',
      'workbook.hideSheet',
      'workbook.moveSheet',
      'workbook.redo',
      'workbook.removeSheet',
      'workbook.renameSheet',
      'workbook.undo',
      'workbook.unhideSheet',
      'workbookFormula.cancelReferencePick',
      'workbookFormula.captureDraft',
      'workbookFormula.externalService.unregister',
      'workbookFormula.function.unregister',
      'workbookFormula.pickReference',
      'workbookFormula.removeDefinedName',
      'workbookFormula.removeTable',
      'workbookFormula.restoreDraft',
      'workbookFormula.setDefinedName',
      'workbookFormula.setTable',
      'workbookFormula.textService.unregister',
    ]);

    editor.destroy();
    editor.destroy();
    expect(created[0]?.destroyCount()).toBe(1);
    expect(() => editor.commands.run(RenameWorkbookSheetCommand, { sheetId: 'sheet-1', name: 'Again' })).toThrow(
      'WorkbookCommandBus has been destroyed.',
    );
  });

  it('publishes workbook state and active editor snapshots through observations', () => {
    const { created, factory } = createFakeFactory();
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      sheetEditorFactory: factory,
    });
    const states: string[][] = [];
    const activeEditors: Array<{ sheetId: string; editor: SheetEditor }> = [];
    const disposeState = editor.observations.subscribe(WorkbookDocumentStateObservation, (state) => {
      states.push(state.sheets.map((sheet) => `${sheet.id}:${sheet.name}`));
    });
    editor.observations.subscribe(WorkbookActiveSheetEditorObservation, (snapshot) => {
      activeEditors.push(snapshot);
    });

    expect(states).toEqual([['sheet-1:One', 'sheet-2:Two']]);
    expect(activeEditors).toEqual([{ sheetId: 'sheet-1', editor: created[0] }]);

    editor.commands.run(RenameWorkbookSheetCommand, { sheetId: 'sheet-2', name: 'Data' });
    expect(states.at(-1)).toEqual(['sheet-1:One', 'sheet-2:Data']);
    expect(activeEditors).toHaveLength(1);

    expect(() => editor.commands.run(RenameWorkbookSheetCommand, { sheetId: 'missing', name: 'Invalid' })).toThrow();
    expect(states).toHaveLength(2);
    expect(activeEditors).toHaveLength(1);

    editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-2' });
    expect(states).toHaveLength(2);
    expect(activeEditors).toEqual([
      { sheetId: 'sheet-1', editor: created[0] },
      { sheetId: 'sheet-2', editor: created[1] },
    ]);

    disposeState();
    editor.commands.run(RenameWorkbookSheetCommand, { sheetId: 'sheet-2', name: 'Final' });
    expect(states).toHaveLength(2);

    editor.destroy();
    expect(() => editor.observations.getSnapshot(WorkbookDocumentStateObservation)).toThrow(
      'ObservationRegistry has been destroyed.',
    );
  });

  it('warns for recreated command definitions', () => {
    const { factory } = createFakeFactory();
    const warnings: string[] = [];
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      sheetEditorFactory: factory,
      warn(message) {
        warnings.push(message);
      },
    });
    const RecreatedRenameCommand = defineWorkbookCommand<{ readonly sheetId: string; readonly name: string }>(
      'workbook.renameSheet',
    );

    editor.commands.run(RecreatedRenameCommand, { sheetId: 'sheet-1', name: 'Synthetic' });

    expect(warnings).toEqual(['WorkbookCommandBus received a recreated command definition for workbook.renameSheet.']);

    editor.destroy();
  });

  it('runs third-party Workbook plugins with commands, observations, companion Sheet plugins, and teardown', () => {
    const { created, factory } = createFakeFactory();
    const observedNames: string[][] = [];
    const lifecycle: string[] = [];
    const contributedSheets: string[] = [];
    const capturedPluginConfigs: string[][] = [];
    const configuredSheetPlugins = [ConfiguredSheetPlugin];
    const capturingFactory = (input: WorkbookSheetEditorFactoryInput): SheetEditor => {
      capturedPluginConfigs.push(input.configuration.plugins?.map((plugin) => String(plugin.symbol)) ?? []);
      return factory(input);
    };

    @Injectable()
    class ThirdPartyWorkbookPlugin extends WorkbookPlugin {
      public static readonly symbol = Symbol('ThirdPartyWorkbookPlugin');

      readonly #names: string[] = [];

      public registerCommands(commands: WorkbookCommandBus): void {
        commands.register(ThirdPartyWorkbookCommand, () => this.#names.join('|'));
      }

      public registerObservations(observations: ObservationRegistry): void {
        observations.register(ThirdPartyWorkbookObservation, {
          getSnapshot: () => this.#names,
          subscribe: () => () => void 0,
        });
      }

      public getSheetPlugins(context: WorkbookCompanionSheetPluginContext) {
        contributedSheets.push(context.sheetId);
        return [ThirdPartyCompanionSheetPlugin];
      }

      public initialize(context: WorkbookPluginContext) {
        lifecycle.push(`init:${context.runtime.sheets.getActiveId()}`);
        const dispose = context.runtime.observations.subscribe(WorkbookDocumentStateObservation, (state) => {
          this.#names.push(state.sheets.map((sheet) => sheet.name).join(','));
        });
        return () => {
          lifecycle.push('dispose');
          dispose();
        };
      }

      public onWorkbookDestroy(): void {
        lifecycle.push('destroy');
      }
    }

    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      sheetPlugins: configuredSheetPlugins,
      plugins: [ThirdPartyWorkbookPlugin],
      sheetEditorFactory: capturingFactory,
    });
    editor.observations.subscribe(ThirdPartyWorkbookObservation, (names) => observedNames.push([...names]));

    expect(editor.commands.run(ThirdPartyWorkbookCommand, void 0)).toBe('One,Two');
    editor.commands.run(RenameWorkbookSheetCommand, { sheetId: 'sheet-2', name: 'Data' });
    editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-2' });

    expect(created.map((sheetEditor) => sheetEditor.sheetId)).toEqual(['sheet-1', 'sheet-2']);
    expect(contributedSheets).toEqual(['sheet-1', 'sheet-2']);
    expect(capturedPluginConfigs).toEqual([
      ['Symbol(ConfiguredSheetPlugin)', 'Symbol(ThirdPartyCompanionSheetPlugin)'],
      ['Symbol(ConfiguredSheetPlugin)', 'Symbol(ThirdPartyCompanionSheetPlugin)'],
    ]);
    expect(observedNames).toEqual([['One,Two']]);
    expect(editor.commands.run(ThirdPartyWorkbookCommand, void 0)).toBe('One,Two|One,Data');

    editor.destroy();
    expect(lifecycle).toEqual(['init:sheet-1', 'dispose', 'destroy']);
  });

  it('isolates Workbook plugin instances across multiple WorkbookEditors', () => {
    @Injectable()
    class IsolatedWorkbookPlugin extends WorkbookPlugin {
      public static readonly symbol = Symbol('IsolatedWorkbookPlugin');

      #count = 0;

      public registerCommands(commands: WorkbookCommandBus): void {
        commands.register(ThirdPartyWorkbookCommand, () => String(++this.#count));
      }
    }

    const first = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      plugins: [IsolatedWorkbookPlugin],
      sheetEditorFactory: createFakeFactory().factory,
    });
    const second = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      plugins: [IsolatedWorkbookPlugin],
      sheetEditorFactory: createFakeFactory().factory,
    });

    expect(first.commands.run(ThirdPartyWorkbookCommand, void 0)).toBe('1');
    expect(first.commands.run(ThirdPartyWorkbookCommand, void 0)).toBe('2');
    expect(second.commands.run(ThirdPartyWorkbookCommand, void 0)).toBe('1');

    first.destroy();
    second.destroy();
  });

  it('runs WorkbookFormulaPlugin as a workbook-owned graph with active Sheet companions', () => {
    const workbookFormulaPlugins: WorkbookFormulaPlugin[] = [];
    const created: Array<RecordedSheetEditor & { commit(transaction: Transaction): void }> = [];
    const factory = (input: WorkbookSheetEditorFactoryInput): SheetEditor => {
      let destroyed = 0;
      const pluginInstances =
        input.configuration.plugins?.map(
          (Implementation) => new (Implementation as new () => SheetPlugin<unknown>)(),
        ) ?? [];
      let executing = false;
      const commands = { isExecuting: () => executing } as SheetCommandBus;
      pluginInstances.forEach((plugin) => plugin.initialize?.({ runtime: { commands } } as never));
      const editor: RecordedSheetEditor & { commit(transaction: Transaction): void } = {
        sheetId: input.sheetId,
        sheetState: input.configuration.sheetState,
        commands,
        queries: createSheetQueries(input.configuration.sheetState),
        observations: {} as SheetEditor['observations'],
        services: {} as SheetEditor['services'],
        commit(transaction: Transaction): void {
          executing = true;
          try {
            pluginInstances.forEach((plugin) => plugin.onTransactionCommitted?.(transaction));
          } finally {
            executing = false;
          }
        },
        destroy(): void {
          destroyed += 1;
        },
        destroyCount(): number {
          return destroyed;
        },
      };
      created.push(editor);
      return editor;
    };

    class InstalledWorkbookFormulaPlugin extends WorkbookFormulaPlugin {
      public constructor() {
        super();
        workbookFormulaPlugins.push(this);
      }
    }

    const writeFormulaDependency = defineWorkbookCommand<void, void>('test.workbookFormula.writeDependency');
    const writeFormulaResult = defineWorkbookCommand<void, void>('test.workbookFormula.writeResult');
    let unregisterWriteFormulaResult: (() => void) | undefined;
    const editor = createWorkbookEditor({
      documentState: createFormulaWorkbook(),
      adapters,
      plugins: [InstalledWorkbookFormulaPlugin],
      sheetEditorFactory: factory,
      onCreated: ({ commands }) => {
        commands.register(writeFormulaDependency, () => {
          const plugin = workbookFormulaPlugins[0];
          const formulaCell = plugin.parseReference('One!A1');
          const dependencyCell = plugin.parseReference('Two!A1');
          return plugin.updateFormulaCell(formulaCell, [
            {
              sheetId: dependencyCell.sheetId,
              row: dependencyCell.range.start[0],
              col: dependencyCell.range.start[1],
            },
          ]);
        });
        unregisterWriteFormulaResult = commands.register(writeFormulaResult, () => {
          const plugin = workbookFormulaPlugins[0];
          return plugin.setFormulaResult(plugin.parseReference('One!A1'), 42);
        });
      },
    });
    const stateSnapshots: string[] = [];
    const transactionEvents: string[] = [];
    editor.observations.subscribe(WorkbookFormulaStateObservation, (snapshot) => {
      stateSnapshots.push(
        `${snapshot.workbookId}:${snapshot.activeSheetId}:${snapshot.sheetIds.join(',')}:${snapshot.formulaCellCount}:${
          snapshot.dirtyFormulaCellCount
        }:${snapshot.cachedFormulaResultCount}:${snapshot.observedSheetTransactionCount}`,
      );
    });
    editor.observations.subscribe(WorkbookFormulaSheetTransactionObservation, (event) => {
      transactionEvents.push(`${event.sheetId}:${event.transaction.pluginKey.key}`);
    });

    const workbookFormulaPlugin = workbookFormulaPlugins[0];
    expect(workbookFormulaPlugin).toBeInstanceOf(WorkbookFormulaPlugin);
    Object.assign(workbookFormulaPlugin, { initialized: false });
    expect(() => workbookFormulaPlugin.initialize({} as never)).toThrow('already initialized');
    expect((workbookFormulaPlugin as unknown as { formulas?: unknown }).formulas).toBeUndefined();
    expect(
      (workbookFormulaPlugin as unknown as { pendingSheetTransactions?: unknown }).pendingSheetTransactions,
    ).toBeUndefined();
    expect(Reflect.get(workbookFormulaPlugin, 'observeWorkbookState')).toBeUndefined();
    expect(Reflect.get(workbookFormulaPlugin, 'registerFormulaSource')).toBeUndefined();
    expect(() =>
      workbookFormulaPlugin.observeSheetTransaction('sheet-1', createTransaction(SheetDataPlugin.pluginKey)),
    ).toThrow('active Sheet command');
    const formulaCell = workbookFormulaPlugin.parseReference('One!A1');
    const dependencyCell = workbookFormulaPlugin.parseReference('Two!A1');
    const graphReader = workbookFormulaPlugin.getDependencyGraph();
    expect(Object.isFrozen(graphReader)).toBe(true);
    expect('updateFormulaCell' in graphReader).toBe(false);
    expect('dependencies' in graphReader).toBe(false);
    expect(() =>
      editor.commands.register(defineWorkbookCommand<void, void>('test.lateWorkbookCommand'), () => void 0),
    ).toThrow('editor.commands.run');
    expect(() => unregisterWriteFormulaResult!()).toThrow('editor.commands.run');
    expect(() => editor.commands.destroy()).toThrow('editor.commands.run');
    Object.assign(workbookFormulaPlugin, { assertWorkbookCommandWrite: () => {} });
    expect(() => workbookFormulaPlugin.updateFormulaCell(formulaCell, [])).toThrow('commands.run');
    expect(() => workbookFormulaPlugin.setFormulaResult(formulaCell, 42)).toThrow('commands.run');
    editor.commands.run(writeFormulaDependency, void 0);
    expect(workbookFormulaPlugin.getDependencyGraph().isDirty({ sheetId: 'sheet-1', row: 0, col: 0 })).toBe(true);
    editor.commands.run(writeFormulaResult, void 0);
    expect(workbookFormulaPlugin.getFormulaResult(formulaCell)).toBe(42);
    expect(workbookFormulaPlugin.getDependencyGraph().isDirty({ sheetId: 'sheet-1', row: 0, col: 0 })).toBe(false);
    expect(workbookFormulaPlugin.formatReference(dependencyCell)).toBe('Two!A1');
    const synchronizationPhases: string[] = [];
    const synchronizationFailures: unknown[] = [];
    editor.commands.subscribe((event) => {
      if (event.id !== 'workbookFormula.synchronizeDocumentState') return;
      synchronizationPhases.push(event.phase);
      if (event.phase === 'failed') synchronizationFailures.push(event.error);
    });
    created[0]?.commit(createTransaction(SheetDataPlugin.pluginKey));
    editor.commands.run(RenameWorkbookSheetCommand, { sheetId: 'sheet-2', name: 'Sales Data' });
    expect(synchronizationFailures).toEqual([]);
    expect(synchronizationPhases).toEqual(['started', 'completed']);
    expect(workbookFormulaPlugin.formatReference(dependencyCell)).toBe("'Sales Data'!A1");
    expect(workbookFormulaPlugin.getDependencyGraph().getDependents({ sheetId: 'sheet-2', row: 0, col: 0 })).toEqual([
      { sheetId: 'sheet-1', row: 0, col: 0 },
    ]);
    editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-2' });
    const changedDependencyTransaction = createTransaction(SheetDataPlugin.pluginKey);
    changedDependencyTransaction.addOperation([
      { p: [0, 0], [MatrixOTActionName.UpdateCell]: { value: 'changed', prev: 'old' } },
    ]);
    created[1]?.commit(changedDependencyTransaction);
    expect(workbookFormulaPlugin.getFormulaResult(formulaCell)).toBeUndefined();
    expect(workbookFormulaPlugin.getDependencyGraph().getDirtyFormulaCells()).toEqual([
      { sheetId: 'sheet-1', row: 0, col: 0 },
    ]);
    editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-1' });
    expect(workbookFormulaPlugin.getDependencyGraph().isDirty({ sheetId: 'sheet-1', row: 0, col: 0 })).toBe(true);
    editor.commands.run(RemoveWorkbookSheetCommand, { sheetId: 'sheet-2' });

    expect(transactionEvents).toHaveLength(2);
    expect(transactionEvents[0]).toBe(`sheet-1:${SheetDataPlugin.pluginKey.key}`);
    expect(transactionEvents[1]).toBe(`sheet-2:${SheetDataPlugin.pluginKey.key}`);
    expect(workbookFormulaPlugin.getDependencyGraph().getFormulaCells()).toEqual([
      { sheetId: 'sheet-1', row: 0, col: 0 },
    ]);
    expect(
      workbookFormulaPlugin.getDependencyGraph().getBrokenReferences({ sheetId: 'sheet-1', row: 0, col: 0 }),
    ).toEqual([
      {
        kind: 'broken',
        reason: 'sheetDeleted',
        sheetId: 'sheet-2',
        reference: { sheetId: 'sheet-2', row: 0, col: 0 },
      },
    ]);
    expect(workbookFormulaPlugin.getFormulaResult(formulaCell)).toEqual({ kind: 'error', code: '#REF!' });
    expect(stateSnapshots).toContain('book-1:sheet-1:sheet-1,sheet-2:0:0:0:0');
    expect(stateSnapshots).toContain('book-1:sheet-1:sheet-1,sheet-2:1:1:0:0');
    expect(stateSnapshots).toContain('book-1:sheet-1:sheet-1,sheet-2:1:0:1:1');
    expect(stateSnapshots).toContain('book-1:sheet-2:sheet-1,sheet-2:1:1:0:2');

    editor.destroy();
  });

  it('recalculates dirty cross-sheet workbook formulas and keeps results across active sheet changes', () => {
    const workbookFormulaPlugins: WorkbookFormulaPlugin[] = [];
    const created: Array<RecordedSheetEditor & { commit(transaction: Transaction): void }> = [];
    const exportCalls: string[] = [];
    const factory = (input: WorkbookSheetEditorFactoryInput): SheetEditor => {
      const sheetState = cloneSheetDocumentState(input.configuration.sheetState);
      const pluginInstances =
        input.configuration.plugins?.map(
          (Implementation) => new (Implementation as new () => SheetPlugin<unknown>)(),
        ) ?? [];
      let executing = false;
      const isExecuting = (): boolean => executing;
      pluginInstances.forEach((plugin) => plugin.initialize?.({ runtime: { commands: { isExecuting } } } as never));
      const queries = new SheetQueryRegistry();
      queries.register(ReadSheetCellDataQuery, () => sheetState.sheetData);
      const editor: RecordedSheetEditor & { commit(transaction: Transaction): void } = {
        sheetId: input.sheetId,
        sheetState,
        commands: {
          isExecuting,
          has(definition: unknown): boolean {
            return definition === ExportSheetStateCommand;
          },
          run(definition: unknown): unknown {
            if (definition !== ExportSheetStateCommand) throw new Error('Unexpected sheet command.');
            exportCalls.push(input.sheetId);
            return { pipeline: new Pipeline('test.exportSheetState'), sheetState };
          },
        } as unknown as SheetCommandBus,
        queries,
        observations: {} as SheetEditor['observations'],
        services: {} as SheetEditor['services'],
        commit(transaction: Transaction): void {
          executing = true;
          try {
            pluginInstances.forEach((plugin) => plugin.onTransactionCommitted?.(transaction));
          } finally {
            executing = false;
          }
        },
        destroy(): void {},
        destroyCount(): number {
          return 0;
        },
      };
      created.push(editor);
      return editor;
    };

    class InstalledWorkbookFormulaPlugin extends WorkbookFormulaPlugin {
      public constructor() {
        super();
        workbookFormulaPlugins.push(this);
      }
    }

    const sheetOneData = new SheetMatrix(void 0, [2, 4]);
    sheetOneData.addItem(0, 0, { type: CellType.Formula, formula: '=SUM(Two!A1:B2)+1' });
    sheetOneData.addItem(0, 1, { type: CellType.Formula, formula: '=AVERAGE(Two!A1:B2)' });
    sheetOneData.addItem(1, 0, { type: CellType.Formula, formula: '=SUMIF(Two!A1:A2,">4",Two!B1:B2)' });
    sheetOneData.addItem(1, 1, { type: CellType.Formula, formula: '=VLOOKUP(5,Two!A1:B2,2,FALSE)' });
    const sheetTwoData = new SheetMatrix(void 0, [2, 2]);
    sheetTwoData.addItem(0, 0, { type: CellType.Number, value: 1 });
    sheetTwoData.addItem(0, 1, { type: CellType.Number, value: 3 });
    sheetTwoData.addItem(1, 0, { type: CellType.Number, value: 5 });
    sheetTwoData.addItem(1, 1, { type: CellType.Number, value: 7 });
    const workbook = createWorkbookDocumentState<SheetDocumentState>({
      id: 'book-1',
      sheets: [
        { id: 'sheet-1', name: 'One' },
        { id: 'sheet-2', name: 'Two' },
      ],
      sheetStates: {
        'sheet-1': { sheetData: sheetOneData } as SheetDocumentState,
        'sheet-2': { sheetData: sheetTwoData } as SheetDocumentState,
      },
    });

    const editor = createWorkbookEditor({
      documentState: workbook,
      adapters,
      plugins: [InstalledWorkbookFormulaPlugin],
      sheetEditorFactory: factory,
    });

    expect(exportCalls).toEqual([]);

    const workbookFormulaPlugin = workbookFormulaPlugins[0];
    const formulaCell = workbookFormulaPlugin.parseReference('One!A1');
    const averageFormulaCell = workbookFormulaPlugin.parseReference('One!B1');
    expect(() =>
      workbookFormulaPlugin.assertSheetRangeMoveSupported('sheet-2', {
        source: { start: [0, 0], end: [1, 1] },
        destination: { start: [2, 0], end: [3, 1] },
      }),
    ).toThrow('workbook-wide transaction');
    expect(() =>
      workbookFormulaPlugin.assertSheetRangeMoveSupported('sheet-1', {
        source: { start: [0, 2], end: [0, 2] },
        destination: { start: [1, 2], end: [1, 2] },
      }),
    ).not.toThrow();
    const sumifFormulaCell = workbookFormulaPlugin.parseReference('One!A2');
    const vlookupFormulaCell = workbookFormulaPlugin.parseReference('One!B2');

    expect(workbookFormulaPlugin.getFormulaResult(formulaCell)).toBe(17);
    expect(workbookFormulaPlugin.getFormulaResult(averageFormulaCell)).toBe(4);
    expect(workbookFormulaPlugin.getFormulaResult(sumifFormulaCell)).toBe(7);
    expect(workbookFormulaPlugin.getFormulaResult(vlookupFormulaCell)).toBe(7);
    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 0, 0)).toBe('=SUM(Two!A1:B2)+1');
    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 0, 1)).toBe('=AVERAGE(Two!A1:B2)');
    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 1, 0)).toBe('=SUMIF(Two!A1:A2,">4",Two!B1:B2)');
    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 1, 1)).toBe('=VLOOKUP(5,Two!A1:B2,2,FALSE)');
    expect(editor.commands.run(RecalculateWorkbookFormulasCommand, void 0)).toEqual({
      recalculatedCells: [],
      remainingDirtyCells: [],
    });

    editor.commands.run(RenameWorkbookSheetCommand, { sheetId: 'sheet-2', name: 'Sales Data' });
    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 0, 0)).toBe("=SUM('Sales Data'!A1:B2)+1");
    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 0, 1)).toBe("=AVERAGE('Sales Data'!A1:B2)");
    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 1, 0)).toBe(
      "=SUMIF('Sales Data'!A1:A2,\">4\",'Sales Data'!B1:B2)",
    );
    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 1, 1)).toBe("=VLOOKUP(5,'Sales Data'!A1:B2,2,FALSE)");

    editor.commands.run(MoveWorkbookSheetCommand, { sheetId: 'sheet-2', toIndex: 0 });
    expect(editor.document.getState().sheets.map((sheet) => sheet.id)).toEqual(['sheet-2', 'sheet-1']);
    expect(workbookFormulaPlugin.getFormulaResult(formulaCell)).toBe(17);
    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 0, 0)).toBe("=SUM('Sales Data'!A1:B2)+1");

    editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-2' });
    const activeSheetTwo = created[1];
    activeSheetTwo.sheetState.sheetData.addItem(0, 0, { type: CellType.Number, value: 9 });
    const changedDependencyTransaction = createTransaction(SheetDataPlugin.pluginKey);
    changedDependencyTransaction.addOperation([
      { p: [0, 0], [MatrixOTActionName.UpdateCell]: { value: { type: CellType.Number, value: 9 }, prev: 1 } },
    ]);
    activeSheetTwo.commit(changedDependencyTransaction);

    expect(workbookFormulaPlugin.getFormulaResult(formulaCell)).toBe(25);
    expect(workbookFormulaPlugin.getFormulaResult(averageFormulaCell)).toBe(6);
    expect(workbookFormulaPlugin.getFormulaResult(sumifFormulaCell)).toBe(10);
    expect(workbookFormulaPlugin.getFormulaResult(vlookupFormulaCell)).toBe(7);
    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 0, 0)).toBe("=SUM('Sales Data'!A1:B2)+1");
    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 0, 1)).toBe("=AVERAGE('Sales Data'!A1:B2)");
    expect(editor.commands.run(RecalculateWorkbookFormulasCommand, void 0)).toEqual({
      recalculatedCells: [],
      remainingDirtyCells: [],
    });

    editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-1' });
    expect(workbookFormulaPlugin.getFormulaResult(formulaCell)).toBe(25);
    expect(workbookFormulaPlugin.getFormulaResult(averageFormulaCell)).toBe(6);
    expect(workbookFormulaPlugin.getFormulaResult(sumifFormulaCell)).toBe(10);
    expect(workbookFormulaPlugin.getFormulaResult(vlookupFormulaCell)).toBe(7);

    editor.commands.run(RemoveWorkbookSheetCommand, { sheetId: 'sheet-2' });
    expect(workbookFormulaPlugin.getFormulaResult(formulaCell)).toEqual({ kind: 'error', code: '#REF!' });
    expect(workbookFormulaPlugin.getFormulaResult(averageFormulaCell)).toEqual({ kind: 'error', code: '#REF!' });
    expect(workbookFormulaPlugin.getFormulaResult(sumifFormulaCell)).toEqual({ kind: 'error', code: '#REF!' });
    expect(workbookFormulaPlugin.getFormulaResult(vlookupFormulaCell)).toEqual({ kind: 'error', code: '#REF!' });
    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 0, 0)).toBe('=SUM(#REF!A1:B2)+1');
    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 0, 1)).toBe('=AVERAGE(#REF!A1:B2)');
    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 1, 0)).toBe('=SUMIF(#REF!A1:A2,">4",#REF!B1:B2)');
    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 1, 1)).toBe('=VLOOKUP(5,#REF!A1:B2,2,FALSE)');

    editor.commands.run(UndoWorkbookCommand, void 0);
    expect(workbookFormulaPlugin.getFormulaResult(formulaCell)).toBe(25);
    expect(workbookFormulaPlugin.getFormulaResult(averageFormulaCell)).toBe(6);
    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 0, 0)).toBe("=SUM('Sales Data'!A1:B2)+1");

    editor.commands.run(UndoWorkbookCommand, void 0);
    expect(editor.document.getState().sheets.map((sheet) => sheet.id)).toEqual(['sheet-1', 'sheet-2']);
    editor.commands.run(UndoWorkbookCommand, void 0);
    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 0, 0)).toBe('=SUM(Two!A1:B2)+1');

    editor.commands.run(RedoWorkbookCommand, void 0);
    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 0, 0)).toBe("=SUM('Sales Data'!A1:B2)+1");

    editor.destroy();
  });

  it('shifts workbook formula references and formula cell keys after sheet structure changes', () => {
    const workbookFormulaPlugins: WorkbookFormulaPlugin[] = [];
    const created: Array<RecordedSheetEditor & { commit(transaction: Transaction): void }> = [];
    const factory = (input: WorkbookSheetEditorFactoryInput): SheetEditor => {
      const sheetState = cloneSheetDocumentState(input.configuration.sheetState);
      const pluginInstances =
        input.configuration.plugins?.map(
          (Implementation) => new (Implementation as new () => SheetPlugin<unknown>)(),
        ) ?? [];
      let executing = false;
      const isExecuting = (): boolean => executing;
      pluginInstances.forEach((plugin) => plugin.initialize?.({ runtime: { commands: { isExecuting } } } as never));
      const editor: RecordedSheetEditor & { commit(transaction: Transaction): void } = {
        sheetId: input.sheetId,
        sheetState,
        commands: {
          isExecuting,
          has(definition: unknown): boolean {
            return definition === ExportSheetStateCommand;
          },
          run(definition: unknown): unknown {
            if (definition !== ExportSheetStateCommand) throw new Error('Unexpected sheet command.');
            return { pipeline: new Pipeline('test.exportSheetState'), sheetState };
          },
        } as unknown as SheetCommandBus,
        queries: createSheetQueries(sheetState),
        observations: {} as SheetEditor['observations'],
        services: {} as SheetEditor['services'],
        commit(transaction: Transaction): void {
          executing = true;
          try {
            pluginInstances.forEach((plugin) => plugin.onTransactionCommitted?.(transaction));
          } finally {
            executing = false;
          }
        },
        destroy(): void {},
        destroyCount(): number {
          return 0;
        },
      };
      created.push(editor);
      return editor;
    };

    class InstalledWorkbookFormulaPlugin extends WorkbookFormulaPlugin {
      public constructor() {
        super();
        workbookFormulaPlugins.push(this);
      }
    }

    const sheetOneData = new SheetMatrix(void 0, [3, 2]);
    sheetOneData.addItem(0, 0, { type: CellType.Formula, formula: '=Two!A1+1' });
    const sheetTwoData = new SheetMatrix(void 0, [3, 2]);
    sheetTwoData.addItem(0, 0, { type: CellType.Number, value: 2 });
    const workbook = createWorkbookDocumentState<SheetDocumentState>({
      id: 'book-1',
      sheets: [
        { id: 'sheet-1', name: 'One' },
        { id: 'sheet-2', name: 'Two' },
      ],
      sheetStates: {
        'sheet-1': { sheetData: sheetOneData } as SheetDocumentState,
        'sheet-2': { sheetData: sheetTwoData } as SheetDocumentState,
      },
    });

    const editor = createWorkbookEditor({
      documentState: workbook,
      adapters,
      plugins: [InstalledWorkbookFormulaPlugin],
      sheetEditorFactory: factory,
    });
    const workbookFormulaPlugin = workbookFormulaPlugins[0];

    expect(workbookFormulaPlugin.getFormulaResult(workbookFormulaPlugin.parseReference('One!A1'))).toBe(3);

    editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-2' });
    const activeSheetTwo = created[1];
    const insertDependencyRowTransaction = createTransaction(SheetDataPlugin.pluginKey);
    insertDependencyRowTransaction.addOperation([{ p: [0], [MatrixOTActionName.RowInsert]: [null, null] }]);
    MatrixOT.apply(activeSheetTwo.sheetState.sheetData, insertDependencyRowTransaction.operations as never);
    activeSheetTwo.commit(insertDependencyRowTransaction);

    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 0, 0)).toBe('=Two!A2+1');
    expect(workbookFormulaPlugin.getFormulaResult(workbookFormulaPlugin.parseReference('One!A1'))).toBe(3);

    const moveDependencyRowTransaction = createTransaction(SheetDataPlugin.pluginKey);
    moveDependencyRowTransaction.addOperation([{ p: [1], [MatrixOTActionName.RowMove]: [2] }]);
    MatrixOT.apply(activeSheetTwo.sheetState.sheetData, moveDependencyRowTransaction.operations as never);
    activeSheetTwo.commit(moveDependencyRowTransaction);

    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 0, 0)).toBe('=Two!A3+1');
    expect(workbookFormulaPlugin.getFormulaResult(workbookFormulaPlugin.parseReference('One!A1'))).toBe(3);

    editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-1' });
    const activeSheetOne = created[2];
    const insertFormulaRowTransaction = createTransaction(SheetDataPlugin.pluginKey);
    insertFormulaRowTransaction.addOperation([{ p: [0], [MatrixOTActionName.RowInsert]: [null, null] }]);
    MatrixOT.apply(activeSheetOne.sheetState.sheetData, insertFormulaRowTransaction.operations as never);
    activeSheetOne.commit(insertFormulaRowTransaction);

    expect(workbookFormulaPlugin.getDependencyGraph().getFormulaCells()).toEqual([
      { sheetId: 'sheet-1', row: 1, col: 0 },
    ]);
    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 1, 0)).toBe('=Two!A3+1');

    const moveFormulaRowTransaction = createTransaction(SheetDataPlugin.pluginKey);
    moveFormulaRowTransaction.addOperation([{ p: [1], [MatrixOTActionName.RowMove]: [2] }]);
    MatrixOT.apply(activeSheetOne.sheetState.sheetData, moveFormulaRowTransaction.operations as never);
    activeSheetOne.commit(moveFormulaRowTransaction);

    expect(workbookFormulaPlugin.getDependencyGraph().getFormulaCells()).toEqual([
      { sheetId: 'sheet-1', row: 2, col: 0 },
    ]);
    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 2, 0)).toBe('=Two!A3+1');

    editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-2' });
    const activeSheetTwoAgain = created[3];
    const deleteDependencyRowTransaction = createTransaction(SheetDataPlugin.pluginKey);
    deleteDependencyRowTransaction.addOperation([
      { p: [2], [MatrixOTActionName.RowDelete]: [{ type: CellType.Number, value: 2 }, null] },
    ]);
    MatrixOT.apply(activeSheetTwoAgain.sheetState.sheetData, deleteDependencyRowTransaction.operations as never);
    activeSheetTwoAgain.commit(deleteDependencyRowTransaction);

    expect(workbookFormulaPlugin.getFormulaResult(workbookFormulaPlugin.parseReference('One!A3'))).toEqual({
      kind: 'error',
      code: '#REF!',
    });
    expect(workbookFormulaPlugin.getSheetFormulaSource('sheet-1', 2, 0)).toBe('=#REF!+1');

    editor.destroy();
  });

  it('resolves Workbook plugins and their services from isolated editor containers', () => {
    let nextProbeId = 0;
    const destroyed: number[] = [];

    @Injectable()
    class WorkbookProbeService {
      public static readonly symbol = Symbol('WorkbookProbeService');
      public readonly id = ++nextProbeId;
    }

    @Injectable()
    class InjectedWorkbookPlugin extends WorkbookPlugin {
      readonly #probe: WorkbookProbeService;

      public static readonly symbol = Symbol('InjectedWorkbookPlugin');

      public static registerServices(context: WorkbookPluginServiceContext): void {
        context.container.register(WorkbookProbeService.symbol, WorkbookProbeService, Scope.Singleton);
      }

      public constructor(
        @Inject(WorkbookProbeService.symbol)
        probe: WorkbookProbeService,
      ) {
        super();
        this.#probe = probe;
      }

      public registerCommands(commands: WorkbookCommandBus): void {
        commands.register(ThirdPartyWorkbookCommand, () => String(this.#probe.id));
      }

      public onWorkbookDestroy(): void {
        destroyed.push(this.#probe.id);
      }
    }

    const first = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      plugins: [InjectedWorkbookPlugin],
      sheetEditorFactory: createFakeFactory().factory,
    });
    const second = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      plugins: [InjectedWorkbookPlugin],
      sheetEditorFactory: createFakeFactory().factory,
    });

    expect(first.commands.run(ThirdPartyWorkbookCommand, void 0)).toBe('1');
    expect(second.commands.run(ThirdPartyWorkbookCommand, void 0)).toBe('2');
    first.destroy();
    expect(destroyed).toEqual([1]);
    expect(second.commands.run(ThirdPartyWorkbookCommand, void 0)).toBe('2');
    second.destroy();
    expect(destroyed).toEqual([1, 2]);
  });

  it('restores third-party session contributors in dependency order and preserves unloaded entries', () => {
    const firstDefinition = defineSessionState<string>('thirdPartyWorkbook.first');
    const secondDefinition = defineSessionState<number>('thirdPartyWorkbook.second');
    const restoreOrder: string[] = [];

    @Injectable()
    class SessionContributorPlugin extends WorkbookPlugin {
      public static readonly symbol = Symbol('SessionContributorPlugin');
      #first = 'default';
      #second = 0;

      public registerSessionState(registry: SessionStateRegistry): void {
        registry.register(secondDefinition, {
          restorePhase: SessionStateRestorePhase.BeforeInitialize,
          restoreAfter: [firstDefinition],
          capture: () => this.#second,
          restore: (value) => {
            restoreOrder.push(`second:${value}`);
            this.#second = value;
          },
        });
        registry.register(firstDefinition, {
          restorePhase: SessionStateRestorePhase.BeforeInitialize,
          capture: () => this.#first,
          restore: (value) => {
            restoreOrder.push(`first:${value}`);
            this.#first = value;
          },
        });
      }
    }

    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      sessionState: {
        [firstDefinition.id]: 'restored',
        [secondDefinition.id]: 7,
        'thirdPartyWorkbook.unloaded': { retained: true },
      },
      adapters,
      plugins: [SessionContributorPlugin],
      sheetEditorFactory: createFakeFactory().factory,
    });

    expect(restoreOrder).toEqual(['first:restored', 'second:7']);
    const captured = editor.commands.run(CaptureWorkbookSessionStateCommand, void 0).sessionState;
    expect(readSessionState(captured, firstDefinition)).toBe('restored');
    expect(readSessionState(captured, secondDefinition)).toBe(7);
    expect(captured['thirdPartyWorkbook.unloaded']).toEqual({ retained: true });
    editor.destroy();
  });

  it('restores active sheet and detached SheetEditor sessions across WorkbookEditor remounts', () => {
    const mounted: Array<{ sheetId: string; sessionState: SheetSessionState | undefined }> = [];
    const capturedSessions = new Map<WorkbookSheetEditorFactoryInput['sheetId'], SheetSessionState>([
      ['sheet-1', createSessionState(1)],
      ['sheet-2', createSessionState(2)],
    ]);
    const factory = (input: WorkbookSheetEditorFactoryInput): SheetEditor => {
      mounted.push({ sheetId: input.sheetId, sessionState: input.configuration.sessionState });
      return {
        commands: { has: () => false } as unknown as SheetCommandBus,
        queries: createSheetQueries(input.configuration.sheetState),
        observations: {} as SheetEditor['observations'],
        services: {} as SheetEditor['services'],
        destroy(): void {},
      };
    };
    const first = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      sheetEditorFactory: factory,
      captureSheetState: ({ sheetState }) => sheetState,
      captureSheetSessionState: ({ sheetId }) => capturedSessions.get(sheetId),
    });
    first.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-2' });
    const sessionState = first.commands.run(CaptureWorkbookSessionStateCommand, void 0).sessionState;
    const documentState = first.commands.run(ExportWorkbookStateCommand, void 0).documentState;
    first.destroy();

    const remounted = createWorkbookEditor({
      documentState,
      sessionState,
      adapters,
      sheetEditorFactory: factory,
      captureSheetState: ({ sheetState }) => sheetState,
      captureSheetSessionState: ({ sessionState: state }) => state,
    });

    expect(remounted.sheets.getActiveId()).toBe('sheet-2');
    expect(mounted.at(-1)).toEqual({ sheetId: 'sheet-2', sessionState: createSessionState(2) });
    expect(readSessionState(sessionState, WorkbookActiveSheetSessionStateDefinition)).toBe('sheet-2');
    remounted.destroy();
  });

  it('rejects direct Workbook transactions outside a typed command', () => {
    let runtime: WorkbookPluginContext['runtime'] | undefined;
    @Injectable()
    class RuntimeCapturePlugin extends WorkbookPlugin {
      public static readonly symbol = Symbol('RuntimeCapturePlugin');
      public initialize(context: WorkbookPluginContext): void {
        runtime = context.runtime;
      }
    }
    const { factory } = createFakeFactory();
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      plugins: [RuntimeCapturePlugin],
      sheetEditorFactory: factory,
    });
    try {
      const transaction = new WorkbookTransaction('outside-command', WorkbookHistoryAction.Record);
      expect(() => runtime!.executeTransaction(transaction)).toThrow('editor.commands.run');
      expect(editor.document.getState().sheets[0]?.name).toBe('One');
    } finally {
      editor.destroy();
    }
  });

  it('locks the live document exposed to Workbook plugins across commits', () => {
    let runtime: WorkbookPluginContext['runtime'] | undefined;
    @Injectable()
    class DocumentProbePlugin extends WorkbookPlugin {
      public static readonly symbol = Symbol('DocumentProbePlugin');
      public initialize(context: WorkbookPluginContext): void {
        runtime = context.runtime;
      }
    }
    const sheetData = new SheetMatrix(void 0, [2, 2]);
    sheetData.addItem(0, 0, { type: CellType.String, value: 'before' });
    const documentState = createWorkbookDocumentState<SheetDocumentState>({
      id: 'book-1',
      sheets: [{ id: 'sheet-1', name: 'One' }],
      sheetStates: { 'sheet-1': { sheetData } as SheetDocumentState },
    });
    const { factory } = createFakeFactory();
    const editor = createWorkbookEditor({
      documentState,
      adapters,
      plugins: [DocumentProbePlugin],
      sheetEditorFactory: factory,
    });
    try {
      const assertLocked = (): void => {
        const live = runtime!.document.getState();
        expect(() => {
          (live.sheets[0] as { name: string }).name = 'outside command';
        }).toThrow();
        expect(() =>
          live.sheetStates['sheet-1']!.sheetData.addItem(0, 1, {
            type: CellType.String,
            value: 'outside command',
          }),
        ).toThrow();
        expect(live.sheetStates['sheet-1']!.sheetData.getItem(0, 0)?.value).toBe('before');
      };
      assertLocked();
      editor.commands.run(RenameWorkbookSheetCommand, { sheetId: 'sheet-1', name: 'Renamed' });
      assertLocked();
      expect(editor.document.getState().sheets[0]?.name).toBe('Renamed');
    } finally {
      editor.destroy();
    }
  });

  it('does not let a sheet factory modify the document staged for activation', () => {
    const { factory } = createFakeFactory();
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      sheetEditorFactory: (input) => {
        if (input.sheetId === 'sheet-2') {
          expect(() => {
            (input.configuration.sheetState as unknown as { label: string }).label = 'outside transaction';
          }).toThrow();
        }
        return factory(input);
      },
    });
    try {
      editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-2' });
      expect((editor.document.getState().sheetStates['sheet-2'] as TestSheetState).label).toBe('two');
    } finally {
      editor.destroy();
    }
  });

  it('does not commit document, active editor, or history when a staged transaction fails', () => {
    const FailWorkbookTransactionCommand = defineWorkbookCommand<void, WorkbookCommandResult>(
      'thirdPartyWorkbook.failTransaction',
    );

    @Injectable()
    class FailingTransactionPlugin extends WorkbookPlugin {
      public static readonly symbol = Symbol('FailingTransactionPlugin');
      #runtime: WorkbookPluginContext['runtime'] | null = null;

      public registerCommands(commands: WorkbookCommandBus): void {
        commands.register(FailWorkbookTransactionCommand, () => {
          const transaction = new WorkbookTransaction(FailWorkbookTransactionCommand.id, WorkbookHistoryAction.Record);
          transaction.addStep('rename', (state) => ({
            ...state,
            documentState: {
              ...state.documentState,
              sheets: state.documentState.sheets.map((sheet) =>
                sheet.id === 'sheet-1' ? { ...sheet, name: 'Staged' } : sheet,
              ),
            },
          }));
          transaction.addStep('fail', () => {
            throw new Error('staged failure');
          });
          return this.#requireRuntime().executeTransaction(transaction);
        });
      }

      public initialize(context: WorkbookPluginContext): void {
        this.#runtime = context.runtime;
      }

      #requireRuntime(): WorkbookPluginContext['runtime'] {
        if (this.#runtime) return this.#runtime;
        throw new Error('FailingTransactionPlugin has not initialized.');
      }
    }

    const { factory } = createFakeFactory();
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      plugins: [FailingTransactionPlugin],
      sheetEditorFactory: factory,
    });
    const beforeDocument = editor.document.getState();
    const beforeEditor = editor.sheets.getActiveEditor();

    expect(() => editor.commands.run(FailWorkbookTransactionCommand, void 0)).toThrow('staged failure');
    expect(editor.document.getState()).toEqual(beforeDocument);
    expect(editor.sheets.getActiveEditor()).toBe(beforeEditor);
    expect(editor.observations.getSnapshot(WorkbookHistoryStatusObservation)).toEqual({
      canUndo: false,
      canRedo: false,
    });
    editor.destroy();
  });

  it('runs activation hooks inside the command and reports failed activation before commit', () => {
    const events: string[] = [];

    @Injectable()
    class ActivationObserverPlugin extends WorkbookPlugin {
      public static readonly symbol = Symbol('ActivationObserverPlugin');

      public onBeforeSheetActivation(): void {
        events.push('before');
      }
      public onSheetActivationFailed(): void {
        events.push('failed');
      }
      public onTransactionCommitted(): void {
        events.push('committed');
      }
    }

    const { factory } = createFakeFactory();
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      plugins: [ActivationObserverPlugin],
      sheetEditorFactory: factory,
    });
    editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-2' });
    expect(events).toEqual(['before', 'committed']);

    events.length = 0;
    expect(() => editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'missing' })).toThrow();
    expect(events).toEqual(['failed']);
    expect(editor.sheets.getActiveId()).toBe('sheet-2');
    editor.destroy();
  });

  it('keeps workbook structural history separate from active-sheet and SheetEditor history', () => {
    const { created, factory } = createFakeFactory();
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      sheetEditorFactory: factory,
    });

    editor.commands.run(ActivateWorkbookSheetCommand, { sheetId: 'sheet-2' });
    expect(editor.observations.getSnapshot(WorkbookHistoryStatusObservation).canUndo).toBe(false);
    editor.commands.run(RenameWorkbookSheetCommand, { sheetId: 'sheet-1', name: 'Renamed' });
    expect(editor.observations.getSnapshot(WorkbookHistoryStatusObservation)).toEqual({
      canUndo: true,
      canRedo: false,
    });

    const activeBeforeUndo = editor.sheets.getActiveEditor();
    editor.commands.run(UndoWorkbookCommand, void 0);
    expect(editor.document.getState().sheets[0]?.name).toBe('One');
    expect(editor.sheets.getActiveId()).toBe('sheet-2');
    expect(editor.sheets.getActiveEditor()).toBe(activeBeforeUndo);
    expect(created).toHaveLength(2);
    expect(editor.observations.getSnapshot(WorkbookHistoryStatusObservation)).toEqual({
      canUndo: false,
      canRedo: true,
    });

    editor.commands.run(RedoWorkbookCommand, void 0);
    expect(editor.document.getState().sheets[0]?.name).toBe('Renamed');
    expect(editor.sheets.getActiveId()).toBe('sheet-2');
    editor.destroy();
  });

  it('records an atomic two-sheet content change without restoring unrelated sheet content', () => {
    const contentState = (value: string): SheetDocumentState => {
      const state = createEmptySheetDocumentState(2, 2);
      state.sheetData.addItem(0, 0, { type: CellType.String, value });
      return state;
    };
    const cellValue = (sheetId: string): unknown =>
      editor.document.getState().sheetStates[sheetId].sheetData.getItem(0, 0);
    const CommitTwoSheetContentCommand = defineWorkbookCommand<void, WorkbookCommandResult>(
      'test.commitTwoSheetContent',
    );
    const ChangeOtherSheetCommand = defineWorkbookCommand<void, WorkbookCommandResult>('test.changeOtherSheetContent');
    const InvalidContentSheetCommand = defineWorkbookCommand<void, WorkbookCommandResult>('test.invalidContentSheet');

    @Injectable()
    class ContentTransactionPlugin extends WorkbookPlugin {
      public static readonly symbol = Symbol('ContentTransactionPlugin');
      #runtime: WorkbookPluginContext['runtime'] | null = null;

      public registerCommands(commands: WorkbookCommandBus): void {
        commands.register(CommitTwoSheetContentCommand, () => {
          const transaction = new WorkbookTransaction(CommitTwoSheetContentCommand.id, WorkbookHistoryAction.Record, [
            'sheet-1',
            'sheet-2',
          ]);
          transaction.addStep('move-content', (state) => ({
            ...state,
            documentState: {
              ...state.documentState,
              sheetStates: {
                ...state.documentState.sheetStates,
                'sheet-1': contentState('source-cleared'),
                'sheet-2': contentState('target-filled'),
              },
            },
          }));
          return this.#runtime!.executeTransaction(transaction);
        });
        commands.register(ChangeOtherSheetCommand, () => {
          const transaction = new WorkbookTransaction(ChangeOtherSheetCommand.id);
          transaction.addStep('other-content', (state) => ({
            ...state,
            documentState: {
              ...state.documentState,
              sheetStates: {
                ...state.documentState.sheetStates,
                'sheet-3': contentState('later-edit'),
              },
            },
          }));
          return this.#runtime!.executeTransaction(transaction);
        });
        commands.register(InvalidContentSheetCommand, () =>
          this.#runtime!.executeTransaction(
            new WorkbookTransaction(InvalidContentSheetCommand.id, WorkbookHistoryAction.Record, [
              'missing-sheet',
            ]).addStep('missing-content', (state) => state),
          ),
        );
      }

      public initialize(context: WorkbookPluginContext): void {
        this.#runtime = context.runtime;
      }
    }

    const documentState = createWorkbookDocumentState({
      id: 'book-1',
      sheets: [
        { id: 'sheet-1', name: 'One' },
        { id: 'sheet-2', name: 'Two' },
        { id: 'sheet-3', name: 'Three' },
      ],
      sheetStates: {
        'sheet-1': contentState('one'),
        'sheet-2': contentState('two'),
        'sheet-3': contentState('three'),
      },
    });
    const { created, factory } = createFakeFactory();
    const mountedSessions: Array<SheetSessionState | undefined> = [];
    const editor = createWorkbookEditor({
      documentState,
      adapters,
      plugins: [ContentTransactionPlugin],
      captureSheetSessionState: () => createSessionState(7),
      sheetEditorFactory: (input) => {
        mountedSessions.push(input.configuration.sessionState);
        return factory(input);
      },
    });
    try {
      const originalEditor = editor.sheets.getActiveEditor();
      editor.commands.run(CommitTwoSheetContentCommand, void 0);
      expect(cellValue('sheet-1')).toEqual({ type: CellType.String, value: 'source-cleared' });
      expect(cellValue('sheet-2')).toEqual({ type: CellType.String, value: 'target-filled' });
      expect(editor.sheets.getActiveEditor()).not.toBe(originalEditor);
      expect(created).toHaveLength(2);
      expect(mountedSessions[1]).toEqual(createSessionState(7));

      editor.commands.run(ChangeOtherSheetCommand, void 0);
      editor.commands.run(UndoWorkbookCommand, void 0);
      expect(cellValue('sheet-1')).toEqual({ type: CellType.String, value: 'one' });
      expect(cellValue('sheet-2')).toEqual({ type: CellType.String, value: 'two' });
      expect(cellValue('sheet-3')).toEqual({ type: CellType.String, value: 'later-edit' });

      editor.commands.run(RedoWorkbookCommand, void 0);
      expect(cellValue('sheet-1')).toEqual({ type: CellType.String, value: 'source-cleared' });
      expect(cellValue('sheet-2')).toEqual({ type: CellType.String, value: 'target-filled' });
      expect(cellValue('sheet-3')).toEqual({ type: CellType.String, value: 'later-edit' });
      expect(() => editor.commands.run(InvalidContentSheetCommand, void 0)).toThrow('must exist before and after');
      expect(editor.observations.getSnapshot(WorkbookHistoryStatusObservation)).toEqual({
        canUndo: true,
        canRedo: false,
      });
    } finally {
      editor.destroy();
    }
  });

  it('does not let a later plugin change committed history through a transaction event', () => {
    let retainedEvent: WorkbookTransactionCommittedEvent | undefined;

    @Injectable()
    class RetainingTransactionPlugin extends WorkbookPlugin {
      public static readonly symbol = Symbol('RetainingTransactionPlugin');

      public onTransactionCommitted(event: WorkbookTransactionCommittedEvent): void {
        retainedEvent = event;
      }
    }

    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      plugins: [RetainingTransactionPlugin],
      sheetEditorFactory: createFakeFactory().factory,
    });
    try {
      editor.commands.run(RenameWorkbookSheetCommand, { sheetId: 'sheet-1', name: 'Renamed' });
      const event = retainedEvent!;
      expect(() => {
        (event.before.documentState.sheets[0] as { name: string }).name = 'Forged before';
      }).toThrow();
      expect(() => {
        (event.after.documentState.sheets[0] as { name: string }).name = 'Forged after';
      }).toThrow();
      expect(() => {
        (event.after.documentState.sheetStates['sheet-1'] as TestSheetState as { label: string }).label =
          'Forged state';
      }).toThrow();
      expect(() => {
        (event as { after: unknown }).after = event.before;
      }).toThrow();

      editor.commands.run(UndoWorkbookCommand, void 0);
      expect(editor.document.getState().sheets[0]?.name).toBe('One');
      editor.commands.run(RedoWorkbookCommand, void 0);
      expect(editor.document.getState().sheets[0]?.name).toBe('Renamed');
      expect((editor.document.getState().sheetStates['sheet-1'] as TestSheetState).label).toBe('one');
    } finally {
      editor.destroy();
    }
  });

  it('restores workbook structural history across editor remounts', () => {
    const first = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      sheetEditorFactory: createFakeFactory().factory,
    });
    first.commands.run(RenameWorkbookSheetCommand, { sheetId: 'sheet-1', name: 'Renamed' });
    const documentState = first.commands.run(ExportWorkbookStateCommand, void 0).documentState;
    const sessionState = first.commands.run(CaptureWorkbookSessionStateCommand, void 0).sessionState;
    first.destroy();

    const remounted = createWorkbookEditor({
      documentState,
      sessionState,
      adapters,
      sheetEditorFactory: createFakeFactory().factory,
    });

    expect(remounted.observations.getSnapshot(WorkbookHistoryStatusObservation)).toEqual({
      canUndo: true,
      canRedo: false,
    });
    remounted.commands.run(UndoWorkbookCommand, void 0);
    expect(remounted.document.getState().sheets[0]?.name).toBe('One');
    remounted.destroy();
  });

  it('releases initialized plugins and the active SheetEditor when setup fails', () => {
    const lifecycle: string[] = [];
    const { created, factory } = createFakeFactory();

    @Injectable()
    class InitializedPlugin extends WorkbookPlugin {
      public static readonly symbol = Symbol('InitializedPlugin');

      public initialize(): () => void {
        lifecycle.push('first:init');
        return () => lifecycle.push('first:dispose');
      }

      public onWorkbookDestroy(): void {
        lifecycle.push('first:destroy');
      }
    }

    @Injectable()
    class FailingInitializePlugin extends WorkbookPlugin {
      public static readonly symbol = Symbol('FailingInitializePlugin');

      public initialize(): void {
        lifecycle.push('second:init');
        throw new Error('initialize failure');
      }

      public onWorkbookDestroy(): void {
        lifecycle.push('second:destroy');
      }
    }

    expect(() =>
      createWorkbookEditor({
        documentState: createWorkbook(),
        adapters,
        plugins: [InitializedPlugin, FailingInitializePlugin],
        sheetEditorFactory: factory,
      }),
    ).toThrow('initialize failure');
    expect(lifecycle).toEqual(['first:init', 'second:init', 'first:dispose', 'second:destroy', 'first:destroy']);
    expect(created[0]?.destroyCount()).toBe(1);
  });

  it('rejects retained Workbook observation and capability registry writes', () => {
    const observation = defineStateObservation<number>('test.workbook.registryGuard');
    const capability = defineWorkbookRuntimeCapability<number>('test.workbook.registryGuard');
    let extensions: WorkbookPluginContext['runtime']['extensions'] | null = null;
    let sessionStore: WorkbookSessionStore | null = null;
    let functions: IFunctionRegistry | null = null;
    let externalServices: IFormulaExternalServiceProvider | null = null;
    let textServices: IFormulaTextServiceProvider | null = null;
    @Injectable()
    class RetainedRegistriesPlugin extends WorkbookPlugin {
      public static readonly symbol = Symbol('RetainedWorkbookRegistriesPlugin');
      public static registerServices(context: WorkbookPluginServiceContext): void {
        sessionStore = context.container.resolve<WorkbookSessionStore>(WorkbookSessionStore.symbol);
        externalServices = context.container.resolve<IFormulaExternalServiceProvider>(
          IFormulaExternalServiceProvider.symbol,
        );
        Object.assign(sessionStore, { enforceCommandBoundary: () => void 0 });
        Object.assign(externalServices, { enforceTeardownBoundary: () => void 0 });
      }
      public initialize(context: WorkbookPluginContext): void {
        extensions = context.runtime.extensions;
        functions = context.container.resolve<IFunctionRegistry>(IFunctionRegistry.symbol);
        externalServices = context.container.resolve<IFormulaExternalServiceProvider>(
          IFormulaExternalServiceProvider.symbol,
        );
        textServices = context.container.resolve<IFormulaTextServiceProvider>(IFormulaTextServiceProvider.symbol);
        Object.assign(extensions, { enforceWriteBoundary: () => void 0 });
        Object.assign(context.runtime.observations, { enforceWriteBoundary: () => void 0 });
        Object.assign(context.runtime.commands, { enforceRegistrationBoundary: () => void 0 });
        Object.assign(functions, { enforceCommandBoundary: () => void 0 });
        Object.assign(externalServices, { enforceCommandBoundary: () => void 0 });
        Object.assign(textServices, { enforceCommandBoundary: () => void 0 });
      }
    }
    const editor = createWorkbookEditor({
      documentState: createWorkbook(),
      adapters,
      plugins: [RetainedRegistriesPlugin],
      sheetEditorFactory: createFakeFactory().factory,
    });
    try {
      expect(() =>
        editor.observations.register(observation, {
          getSnapshot: () => 1,
          subscribe: () => () => void 0,
        }),
      ).toThrow('editor.commands.run');
      expect(() => extensions!.register(capability, 1)).toThrow('editor.commands.run');
      expect(() => sessionStore!.setActiveSheetId('sheet-2')).toThrow('editor.commands.run');
      expect(() => functions!.register({ name: 'FORGED', evaluate: () => 1 })).toThrow('editor.commands.run');
      expect(() => externalServices!.register(FormulaAddInServiceDefinition, {} as never)).toThrow(
        'editor.commands.run',
      );
      expect(() => externalServices!.destroy()).toThrow('editor owner');
      expect(() => textServices!.registerPhoneticReader?.({} as never)).toThrow('editor.commands.run');
      expect(() =>
        editor.commands.register(defineWorkbookCommand<void, void>('test.workbook.forged'), () => undefined),
      ).toThrow('editor.commands.run');
      expect(() => editor.observations.destroy()).toThrow('editor.commands.run');
      expect(() => extensions!.destroy()).toThrow('editor.commands.run');
      expect(editor.document.getState().sheets).toHaveLength(2);
    } finally {
      editor.destroy();
    }
  });

  it('seals a Workbook-owned collaboration channel retained by a Sheet plugin', () => {
    const plugin = new WorkbookCollaborationPlugin({ create: () => ({} as never) }, {
      warn: () => void 0,
      createId: () => 'test-client',
    } as never);
    const channel = plugin.getSheetServices({ sheetId: 'sheet-1' } as never)[0]!.value.channel;
    Object.assign(channel, { enforceCommandBoundary: () => void 0 });
    plugin.initialize({
      runtime: {
        commands: { isExecuting: () => false, runWithoutMutationAuthority: (callback: () => unknown) => callback() },
      },
    } as never);

    expect(() => channel.disconnect()).toThrow('editor.commands.run');
  });
});
