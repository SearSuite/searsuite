import { buildSelectionUpdate } from '../src/SheetCellEditorGeometry';
import { SheetFormulaBarObservation } from '../src/SheetFormulaBarObservation';
import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { RequestCellEditorRenderCommand } from '../src/SheetCellEditorCommands';
import { Rect } from '@searsuite/sear-foundation-rect';
import { RectOTActionName } from '@searsuite/sear-domain-ot';
import { createTransaction, Transaction } from '@searsuite/sear-domain-transaction';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { Pipeline, SearCoreDoc, SearCoreSheet } from '@searsuite/sear-assembly-core';
import { Container } from '@searsuite/sear-foundation-di';
import { CellRegion } from '@searsuite/sear-render-registry';
import { DocNodeRegistry, stringToRichDoc } from '@searsuite/sear-domain-doc';
import { SheetCellEditorPlugin } from '../src/SheetCellEditor';
import { FormulaAutoCloseTracker } from '../src/formulaAssist/FormulaAutoCloseTracker';
import {
  BeginCellEditorDragSelectionCommand,
  EndCellEditorDragSelectionCommand,
  HandleCellEditorPointerCommand,
  HandleDocumentInputCommand,
} from '../src/SheetCellEditorCommands';
import {
  defineSheetCommand,
  LocalActionCommand,
  SheetCommandBus,
  SheetQueryRegistry,
} from '@searsuite/sear-assembly-commands';
import { SheetDataFieldNamespace, SheetDataMatrixFieldKey } from '@searsuite/sear-render-engine';
import { SheetHorizontalAlignmentFieldKey } from '@searsuite/sear-plugin-alignment';
import { EnsureSelectionVisibleCommand } from '@searsuite/sear-plugin-selection';
import { SheetColumnSizesFieldKey, SheetRowSizesFieldKey } from '@searsuite/sear-plugin-resize';
import { FakeSheetEmbeddedEditor, type SheetEditSession } from '@searsuite/sear-sheet-editor-contract';
import { IsCellEditingQuery } from '../src/IsCellEditingQuery';

let container: Container;

interface EditorReducer {
  editSession?: {
    getDocument: jest.Mock;
    getSelection: jest.Mock;
    handlePointer: jest.Mock;
    setSelection: jest.Mock;
    dispose: jest.Mock;
  };
  pluginKey: PluginKey;
  docInputPlugin: {
    session: {
      lastSnapshot?: object;
      preferredX?: number | null;
      docSelection: {
        anchor: { path: [number, number]; offset: number };
        head: { path: [number, number]; offset: number };
      };
    };
    clearSession: jest.Mock;
  };
  apply(state: [Rect, Rect, Rect], transaction: Transaction): [Rect, Rect, Rect] | null;
  onTransactionCommitted(transaction: Transaction): void;
  performCleanup(core: { renderEngine: { markDirty: jest.Mock } }): {
    transaction: Transaction;
    dirtyRects: { x: number; y: number; width: number; height: number }[];
  };
  completeCleanup(): void;
  blinker: { stop: jest.Mock; reset: jest.Mock };
  keyboardRouter: { stopListener: jest.Mock };
  pointerCapture: { start: jest.Mock };
  disposePointerCapture: jest.Mock | null;
  highlighter: { clear: jest.Mock };
  cursorEngine: { override: jest.Mock };
  textInput: { stopListener: jest.Mock };
  formulaAutoClose: FormulaAutoCloseTracker;
  docCompositionManager: { clear: jest.Mock };
  docCursorManager: { clearCursor: jest.Mock };
  core: { requestRender: jest.Mock } | null;
  isEditing: boolean;
  isDragSelecting: boolean;
  originalDoc: unknown[];
  originalContentWidth: number;
  lastEditorRect: { x: number; y: number; width: number; height: number } | null;
  lastOverflowLeftX: number | null;
  searCoreDoc: { resolveCursorFromPoint: jest.Mock };
  requestRerender: jest.Mock;
  handleEditorPointer(input: { type: 'pointerDown' | 'pointerMove'; point: { x: number; y: number } }): void;
  onMouseUp(core: object, event: object): boolean | void;
  onDblClick(core: object, event: { target: { properties: Record<string, unknown> } | null }): boolean;
  onMouseMove(core: object, event: object): boolean | void;
  cancelEdit(core: object): void;
  selectionPlugin: { pluginKey: PluginKey };
  buildSelectionUpdate(
    core: {
      getDataEngine(): {
        getDataType(key: unknown): unknown;
        readDataViewField?(viewKey: string, fieldKey: string): unknown;
      };
    },
    event: { target: { properties: Record<string, unknown> } | null },
  ): { anchor: [number, number]; focus: [number, number] } | null;
}

function createSheetFieldDataEngine(fields: {
  readonly sheetData?: unknown;
  readonly rowSizes?: unknown;
  readonly columnSizes?: unknown;
  readonly cellAlignments?: unknown;
}) {
  return {
    getDataType: () => void 0,
    readDataViewField: (_viewKey: string, fieldKey: string) => {
      if (_viewKey !== SheetDataFieldNamespace) return void 0;
      if (fieldKey === SheetDataMatrixFieldKey) return fields.sheetData;
      if (fieldKey === SheetRowSizesFieldKey) return fields.rowSizes;
      if (fieldKey === SheetColumnSizesFieldKey) return fields.columnSizes;
      if (fieldKey === SheetHorizontalAlignmentFieldKey) return fields.cellAlignments;
      return void 0;
    },
  };
}

let currentExecutePipeline: jest.Mock | null = null;

function createExecutePipelineSpy(
  implementation: (pipeline: Pipeline) => void = (pipeline) => {
    pipeline?.steps?.forEach((step) => step.prepare?.());
    pipeline?.steps?.forEach((step) => step.postCommit?.());
  },
): jest.Mock {
  currentExecutePipeline = jest.fn(implementation);
  return currentExecutePipeline;
}

function registerCellEditorDocNodes(): void {
  SheetCellEditorPlugin.registerServices({ container });
}

function createDocCoreMock(width: number = 30) {
  return {
    registerPlugin: jest.fn(),
    prepareEditorRenderLayout: jest.fn(
      (input: { origin: { x: number; y: number }; minWidth: number; minHeight: number }) => ({
        positionRect: {
          x: input.origin.x,
          y: input.origin.y,
          width,
          height: input.minHeight,
        },
        snapshot: { lines: [] },
        cursorRelative: { x: 0, y: 0, height: 10 },
        composingCaretPixelOffset: 0,
        contentWidth: width,
      }),
    ),
    resolveCursorFromPoint: jest.fn(() => ({ path: [0, 0], offset: 0 })),
  };
}

function createCompositionManager() {
  return {
    clear: jest.fn(),
    setText: jest.fn(),
    measure: jest.fn(() => ({ active: false, text: '', textWidth: 0, caretPixelOffset: 0 })),
    getText: jest.fn(() => ''),
    getCaretPixelOffset: jest.fn(() => 0),
  };
}

function createDependencies() {
  return {
    mergePlugin: { isMergedCell: jest.fn() },
    selectionPlugin: { getState: jest.fn(() => [new Rect([[-1,-1],[-1,-1]])]), onFillHandleDoubleClick: jest.fn(() => false), restartNavigation: jest.fn() },
    textInput: { subscribe: jest.fn(), startListener: jest.fn(), stopListener: jest.fn(), setPosition: jest.fn(), refocus: jest.fn() },
    keyboardRouter: { subscribe: jest.fn(), startListener: jest.fn(), stopListener: jest.fn() },
    pointerCapture: { start: jest.fn(() => jest.fn()) },
    cursorEngine: { override: jest.fn() },
    platform: { setInterval: jest.fn(() => 1), clearInterval: jest.fn() },
    highlighter: { clear: jest.fn(), highlight: jest.fn(() => ({ cellRanges: [], textAttributes: [] })) },
    coordinates: { viewToWorld: jest.fn((point: { x: number; y: number }) => point), worldToView: jest.fn() },
    adapter: new FakeSheetEmbeddedEditor(),
    shaper: { shape: jest.fn(() => ({ width: 30, height: 12 })) },
  };
}

let dependencies: ReturnType<typeof createDependencies>;
let bus: SheetCommandBus;
const selectionFromEvent = buildSelectionUpdate as unknown as EditorReducer['buildSelectionUpdate'];

function createEditorReducer(commands = new SheetCommandBus()): EditorReducer {
  if (!commands.has(EnsureSelectionVisibleCommand)) {
    commands.register(EnsureSelectionVisibleCommand,
      () => new LocalActionCommand(EnsureSelectionVisibleCommand.id, () => void 0));
  }
  dependencies = createDependencies();
  bus = commands;
  const editor = new SheetCellEditorPlugin(
    dependencies.mergePlugin as never, dependencies.selectionPlugin as never,
    dependencies.textInput as never, dependencies.keyboardRouter as never,
    dependencies.pointerCapture as never, { register: jest.fn(), resolve: jest.fn(() => 'default') } as never,
    dependencies.cursorEngine as never, dependencies.platform as never, { commit: jest.fn() } as never,
    dependencies.highlighter as never, dependencies.coordinates as never, { register: jest.fn(), get: jest.fn() } as never,
    dependencies.adapter, commands, undefined, dependencies.shaper as never,
  ) as unknown as EditorReducer & {
    commands: SheetCommandBus;
    registerCommands(commands: SheetCommandBus): void;
  };
  // Tests supply staged state directly while the editor's runtime-private fields stay initialized.
  (editor as unknown as { state: unknown }).state = (editor as unknown as SheetCellEditorPlugin).getState();
  Object.defineProperty(editor, 'getState', {
    value: () => (editor as unknown as { state: unknown }).state,
  });
  commands.bind({
    executePipeline: (pipeline) => {
      if (currentExecutePipeline) {
        currentExecutePipeline(pipeline);
        return;
      }
      pipeline.steps.forEach((step) => {
        step.localAction?.();
        step.prepare?.();
      });
      pipeline.steps.forEach((step) => step.postCommit?.());
    },
    applyEffect: () => void 0,
  });
  editor.formulaAutoClose = new FormulaAutoCloseTracker();
  editor.docCompositionManager = createCompositionManager();
  editor.registerCommands(commands);
  return editor;
}

function isCellEditing(editor: unknown): boolean {
  const queries = new SheetQueryRegistry();
  (editor as unknown as SheetCellEditorPlugin).registerQueries(queries);
  return queries.run(IsCellEditingQuery, void 0);
}

function activeDocument(editor: unknown): readonly unknown[] {
  const adapter = dependencies.adapter;
  return adapter.editContexts[0].documentAccessor.read();
}

function openEditorForTest(editor: EditorReducer, value: unknown = 'draft') {
  if (!currentExecutePipeline) createExecutePipelineSpy();
  const core = {
    getDataEngine: () =>
      createSheetFieldDataEngine({
        sheetData: { getItem: () => ({ type: 'string', value }) },
        rowSizes: { shape: [1, 4], getDimensionLeftBoundaryByIndex: () => 20, getDimensionRightBoundaryByIndex: () => 50 },
        columnSizes: { shape: [1, 4], getDimensionLeftBoundaryByIndex: () => 10, getDimensionRightBoundaryByIndex: () => 50 },
      }),
    configEngine: { getDefaultConfig: () => ({ cellPadding: 3 }) },
    renderEngine: { renderContext: {}, markDirty: jest.fn() },
    requestRender: jest.fn(),
  };
  (editor as unknown as SheetCellEditorPlugin).bindCore(core as never);
  expect(editor.onDblClick(core, { target: { properties: { startRowIndex: 0, startColIndex: 0 } } })).toBe(false);
  expect(isCellEditing(editor)).toBe(true);
  return core;
}

function openEditorWithSession(editor: EditorReducer): SheetEditSession {
  const adapter = dependencies.adapter;
  const createSession = adapter.createEditSession.bind(adapter);
  let activeSession: SheetEditSession | null = null;
  jest.spyOn(adapter, 'createEditSession').mockImplementation((context) => {
    activeSession = createSession(context);
    return activeSession;
  });
  openEditorForTest(editor);
  return activeSession!;
}

function renderEditor(editor: object, alignment = 'left') {
  const plugin = editor as SheetCellEditorPlugin;
  const rect = new Rect([[0, 0], [0, 0]]);
  const dims = (start: number, end: number) => ({
    shape: [1, 4], getDimensionLeftBoundaryByIndex: () => start, getDimensionRightBoundaryByIndex: () => end,
  });
  const fields = createSheetFieldDataEngine({
    sheetData: { shape: [4, 4], getItem: () => ({ value: 'draft' }) },
    rowSizes: dims(20, 50), columnSizes: dims(10, 50),
    cellAlignments: { getItem: () => alignment },
  });
  const core = {
    getDataEngine: () => ({ ...fields, getDataType: (id: unknown) => id === plugin.pluginKey ? [rect, rect, rect] : undefined }),
    renderEngine: { markDirty: jest.fn(), scrollManager: { getState: () => ({ x: 0, y: 0 }), getShape: () => [400, 300] }, renderCoordinatorManager: { create: () => null } },
    configEngine: { getDefaultConfig: () => ({ sheetOffsetX: 0, sheetOffsetY: 0 }) },
    requestRender: jest.fn(),
  };
  plugin.render(core as never);
  return core;
}

function executeLocalActions(): void {
  createExecutePipelineSpy((pipeline) => pipeline.steps.forEach((step) => step.localAction?.()));
}

function beginDragForTest(editor: EditorReducer): void {
  executeLocalActions();
  const commands = bus;
  commands.run(BeginCellEditorDragSelectionCommand, void 0);
}

describe('SheetCellEditorPlugin reducer', () => {
  beforeEach(() => {
    container = new Container();
  });

  afterEach(() => {
    currentExecutePipeline = null;
    container.reset();
  });

  it('ignores forged runtime properties for formula assistance and reference picking', () => {
    const editor = createEditorReducer() as unknown as SheetCellEditorPlugin;
    expect(() => editor.registerCommands(new SheetCommandBus())).toThrow('already bound');
    const registrations = new Map<string, { getSnapshot(): unknown }>();
    editor.registerObservations({
      register: (definition: { id: string }, adapter: { getSnapshot(): unknown }) => {
        registrations.set(definition.id, adapter);
      },
    } as never);
    Object.assign(editor, {
      formulaAssistState: { suggestions: [{ name: 'FORGED' }], selectedIndex: 0 },
      referencePick: { start: [0, 0], replaceStart: 0, replaceEnd: 1 },
      commands: new SheetCommandBus(),
      commandCore: {},
    });

    const formulaAssist = [...registrations.values()][0].getSnapshot() as { suggestions: unknown[] };
    expect(formulaAssist.suggestions).toEqual([]);
    expect(editor.onMouseUp({} as never, { target: null } as never)).toBeUndefined();
    expect(bus.has(HandleDocumentInputCommand)).toBe(true);
    expect(() => editor.registerCommands(new SheetCommandBus())).toThrow('already bound');
  });
  it('keeps an active edit session independent of forged writable properties', () => {
    const editor = createEditorReducer();
    const session = openEditorWithSession(editor);
    const forgedInput = jest.fn();
    const forgedReconcile = jest.fn();
    Object.assign(editor, {
      isEditing: false,
      editSession: { handleInput: forgedInput },
      sessionState: { pendingDoc: stringToRichDoc('forged') },
      session: { pendingDoc: stringToRichDoc('forged') },
      core: { requestRender: jest.fn() },
      formulaAutoClose: { reconcile: forgedReconcile },
    });

    expect(isCellEditing(editor)).toBe(true);
    expect(() => (editor as unknown as SheetCellEditorPlugin).bindCore({} as never)).toThrow('already bound');
    expect(JSON.stringify(activeDocument(editor))).toContain('draft');
    editor.lastEditorRect = { x: 0, y: 0, width: 100, height: 30 };
    executeLocalActions();
    const handleInput = jest.spyOn(session, 'handleInput');
    const commands = bus;
    commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'z' });

    expect(handleInput).toHaveBeenCalled();
    expect(forgedInput).not.toHaveBeenCalled();
    expect(forgedReconcile).not.toHaveBeenCalled();
    expect(JSON.stringify(activeDocument(editor))).toContain('draftz');
  });
  it('isolates embedded editor document reads before and after session creation', () => {
    const editor = createEditorReducer();
    const adapter = dependencies.adapter;
    const createSession = adapter.createEditSession.bind(adapter);
    let retainedRead: unknown[] = [];
    jest.spyOn(adapter, 'createEditSession').mockImplementation((context) => {
      retainedRead = context.documentAccessor.read() as unknown[];
      (retainedRead[0] as { content: { text: string }[] }).content[0].text = 'forged';
      return createSession(context);
    });

    openEditorForTest(editor);
    expect(JSON.stringify(activeDocument(editor))).toContain('draft');
    expect(JSON.stringify(activeDocument(editor))).not.toContain('forged');

    const laterRead = activeDocument(editor) as unknown[];
    (laterRead[0] as { content: { text: string }[] }).content[0].text = 'changed';
    expect(JSON.stringify(activeDocument(editor))).toContain('draft');
    expect(JSON.stringify(activeDocument(editor))).not.toContain('changed');
  });
  it('does not activate an edit session when opening command staging fails', () => {
    const editor = createEditorReducer();
    (editor as unknown as { mergePlugin: unknown }).mergePlugin = { isMergedCell: jest.fn(() => null) };
    const startListener = jest.fn();
    Object.assign(dependencies.textInput, { startListener, stopListener: jest.fn() });
    createExecutePipelineSpy(() => {
      throw new Error('staging failed');
    });
    const core = {
      getDataEngine: () =>
        createSheetFieldDataEngine({
          sheetData: { getItem: () => ({ type: 'string', value: 'draft' }) },
          rowSizes: { shape: [1, 3] },
          columnSizes: { shape: [1, 3] },
        }),
    };

    expect(() =>
      editor.onDblClick(core, {
        target: { properties: { startRowIndex: 1, startColIndex: 1 } },
      }),
    ).toThrow('staging failed');
    expect(isCellEditing(editor)).toBe(false);
    expect(startListener).not.toHaveBeenCalled();
  });

  it('keeps the active edit session when cancel command staging fails', () => {
    const editor = createEditorReducer() as EditorReducer & {
      cancelEdit(core: object): void;
    };
    openEditorForTest(editor);
    const stop = jest.fn();
    editor.blinker = { stop, reset: jest.fn() };
    editor.lastEditorRect = { x: 10, y: 20, width: 30, height: 40 };
    editor.pluginKey = new PluginKey('test-editor');
    createExecutePipelineSpy(() => {
      throw new Error('staging failed');
    });

    expect(() => editor.cancelEdit({})).toThrow('staging failed');
    expect(isCellEditing(editor)).toBe(true);
    expect(editor.lastEditorRect).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(stop).not.toHaveBeenCalled();
  });

  it('updates the document selection state without emitting debug console output', () => {
    const editor = createEditorReducer();
    editor.docInputPlugin = {
      session: {
        docSelection: {
          anchor: { path: [0, 0], offset: 0 },
          head: { path: [0, 0], offset: 0 },
        },
      },
      clearSession: jest.fn(),
    };
    const state = [
      new Rect([
        [1, 1],
        [1, 1],
      ]),
      new Rect([
        [1, 1],
        [1, 1],
      ]),
      new Rect([
        [0, 0],
        [0, 0],
      ]),
    ] as [Rect, Rect, Rect];
    const transaction = createTransaction({} as never);
    transaction.addOperation([
      {
        p: [2],
        [RectOTActionName.UpdateRect]: [
          [2, 3],
          [4, 5],
        ],
      },
    ]);
    const log = jest.spyOn(console, 'log').mockImplementation(() => void 0);
    const group = jest.spyOn(console, 'group').mockImplementation(() => void 0);
    const groupEnd = jest.spyOn(console, 'groupEnd').mockImplementation(() => void 0);

    try {
      expect(editor.apply(state, transaction)).toBe(state);
    } finally {
      log.mockRestore();
      group.mockRestore();
      groupEnd.mockRestore();
    }

    expect(state[2].shape).toEqual([
      [2, 3],
      [4, 5],
    ]);
    expect((editor as unknown as SheetCellEditorPlugin).getDocumentSelection()).toEqual({
      anchor: { path: [0, 0], offset: 0 },
      head: { path: [0, 0], offset: 0 },
    });
    expect(log).not.toHaveBeenCalled();
    expect(group).not.toHaveBeenCalled();
    expect(groupEnd).not.toHaveBeenCalled();
  });

  it('updates editor rectangles and commits document selection snapshots', () => {
    const editor = createEditorReducer();
    editor.docInputPlugin = {
      session: {
        docSelection: {
          anchor: { path: [0, 0], offset: 0 },
          head: { path: [0, 0], offset: 0 },
        },
      },
      clearSession: jest.fn(),
    };
    const state = [
      new Rect([
        [0, 0],
        [0, 0],
      ]),
      new Rect([
        [1, 1],
        [1, 1],
      ]),
      new Rect([
        [2, 2],
        [2, 2],
      ]),
    ] as [Rect, Rect, Rect];
    const transaction = createTransaction({} as never);
    transaction.addOperation([
      {
        p: [0],
        [RectOTActionName.UpdateRect]: [
          [3, 3],
          [3, 3],
        ],
      },
      {
        p: [1],
        [RectOTActionName.UpdateRect]: [
          [4, 4],
          [4, 4],
        ],
      },
      {
        p: [2],
        [RectOTActionName.UpdateRect]: [
          [5, 6],
          [7, 8],
        ],
      },
      {
        p: [2],
        [RectOTActionName.UpdateRect]: [
          [5, 6],
          [7, 8],
        ],
      },
    ] as never);
    editor.apply(state, transaction);

    expect(state[0].shape).toEqual([
      [3, 3],
      [3, 3],
    ]);
    expect(state[1].shape).toEqual([
      [4, 4],
      [4, 4],
    ]);
    expect(state[2].shape).toEqual([
      [5, 6],
      [7, 8],
    ]);
    expect((editor as unknown as SheetCellEditorPlugin).getDocumentSelection()).toEqual({
      anchor: { path: [0, 0], offset: 0 },
      head: { path: [0, 0], offset: 0 },
    });

    const rangeOnlyTransaction = createTransaction({} as never);
    rangeOnlyTransaction.addOperation([
      {
        p: [0],
        [RectOTActionName.UpdateRect]: [
          [9, 9],
          [9, 9],
        ],
      },
    ] as never);
    editor.apply(state, rangeOnlyTransaction);
    expect(state[0].shape).toEqual([
      [9, 9],
      [9, 9],
    ]);
  });

  it('synchronizes document selection only for committed document-selection rectangles', () => {
    const commands = new SheetCommandBus();
    const editor = createEditorReducer(commands);
    const committed = defineSheetCommand<void>('test.cellEditor.committed');
    let transactionToCommit: Transaction;
    commands.register(
      committed,
      () => new LocalActionCommand(committed.id, () => editor.onTransactionCommitted(transactionToCommit)),
    );
    const commit = (transaction: Transaction): void => {
      transactionToCommit = transaction;
      commands.run(committed, void 0);
    };
    const editorKey = new PluginKey('test-editor');
    editor.pluginKey = editorKey;
    editor.docInputPlugin = {
      session: {
        docSelection: {
          anchor: { path: [0, 0], offset: 0 },
          head: { path: [0, 0], offset: 0 },
        },
      },
      clearSession: jest.fn(),
    };
    const state = [
      new Rect([
        [0, 0],
        [0, 0],
      ]),
      new Rect([
        [0, 0],
        [0, 0],
      ]),
      new Rect([
        [2, 3],
        [4, 5],
      ]),
    ] as [Rect, Rect, Rect];
    (editor as unknown as { state: typeof state }).state = state;

    expect(() => editor.onTransactionCommitted(createTransaction(new PluginKey('other-editor')))).toThrow(
      'editor.commands.run',
    );
    commit(createTransaction(new PluginKey('other-editor')));
    const unrelated = createTransaction(editorKey);
    unrelated.addOperation([
      {
        p: [0],
        [RectOTActionName.UpdateRect]: [
          [1, 1],
          [1, 1],
        ],
      },
    ]);
    commit(unrelated);
    expect((editor as unknown as SheetCellEditorPlugin).getDocumentSelection()).toEqual({
      anchor: { path: [0, 0], offset: 0 },
      head: { path: [0, 0], offset: 0 },
    });

    const committedSelection = createTransaction(editorKey);
    committedSelection.addOperation([
      {
        p: [2],
        [RectOTActionName.UpdateRect]: [
          [2, 3],
          [4, 5],
        ],
      },
    ]);
    commit(committedSelection);
    expect((editor as unknown as SheetCellEditorPlugin).getDocumentSelection()).toEqual({
      anchor: { path: [2, 0], offset: 3 },
      head: { path: [4, 0], offset: 5 },
    });
  });

  it('updates editor anchor and focus rectangles through ordinary range operations', () => {
    const editor = createEditorReducer();
    const state = [
      new Rect([
        [0, 0],
        [0, 0],
      ]),
      new Rect([
        [0, 0],
        [0, 0],
      ]),
      new Rect([
        [0, 0],
        [0, 0],
      ]),
    ] as [Rect, Rect, Rect];
    const transaction = createTransaction({} as never);
    transaction.addOperation([
      {
        p: [0],
        [RectOTActionName.UpdateRect]: [
          [1, 2],
          [1, 2],
        ],
      },
      {
        p: [1],
        [RectOTActionName.UpdateRect]: [
          [1, 2],
          [3, 4],
        ],
      },
    ]);

    expect(editor.apply(state, transaction)).toBe(state);
    expect(state[0].shape).toEqual([
      [1, 2],
      [1, 2],
    ]);
    expect(state[1].shape).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('ignores operations that are not UpdateRect payload updates', () => {
    const editor = createEditorReducer();
    editor.docInputPlugin = {
      session: {
        docSelection: {
          anchor: { path: [0, 0], offset: 0 },
          head: { path: [0, 0], offset: 0 },
        },
      },
      clearSession: jest.fn(),
    } as never;
    const state = [
      new Rect([
        [0, 0],
        [0, 0],
      ]),
      new Rect([
        [0, 0],
        [0, 0],
      ]),
      new Rect([
        [0, 0],
        [0, 0],
      ]),
    ] as [Rect, Rect, Rect];
    const transaction = createTransaction({} as never);
    transaction.addOperation([{ p: [0], xx: 1 } as never]);

    expect(editor.apply(state, transaction)).toBe(state);
    expect(state[0].shape).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it('releases capture, stops blinking and clears the cursor only after cancellation commits', () => {
    const editor = createEditorReducer();
    const core = openEditorForTest(editor);
    const dispose = jest.fn();
    dependencies.pointerCapture.start.mockReturnValue(dispose);
    beginDragForTest(editor);
    const execute = createExecutePipelineSpy(() => {});
    editor.cancelEdit(core);
    expect(isCellEditing(editor)).toBe(true);
    expect(dispose).not.toHaveBeenCalled();
    const pipeline: Pipeline = execute.mock.calls[0][0];
    expect(pipeline.dirtyRects).toEqual([]);
    createExecutePipelineSpy();
    editor.cancelEdit(core);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dependencies.platform.clearInterval).toHaveBeenCalled();
    expect(dependencies.cursorEngine.override).toHaveBeenLastCalledWith(null);
    expect(isCellEditing(editor)).toBe(false);
  });

  it.each([
    { textWidth: 37, overflow: [] },
    { textWidth: 42, overflow: [{ x: 4, y: 20, width: 5, height: 30 }] },
  ])('invalidates only the painted left overflow when cancelling ($textWidth px text)', ({ textWidth, overflow }) => {
    const editor = createEditorReducer();
    openEditorForTest(editor);
    dependencies.shaper.shape.mockReturnValue({ width: textWidth, height: 12 });
    const core = renderEditor(editor, 'right');
    const execute = createExecutePipelineSpy();
    editor.cancelEdit(core);
    const pipeline: Pipeline = execute.mock.calls[0][0];
    expect(pipeline.dirtyRects).toHaveLength(1 + overflow.length);
    expect(pipeline.dirtyRects[0]).toMatchObject({ x: 10, y: 20, height: 30 });
    expect(pipeline.dirtyRects.slice(1)).toMatchObject(overflow);
  });

  it('builds a whole-column selection transaction when editing is interrupted from a column header', () => {
    const core = {
      getDataEngine: () =>
        createSheetFieldDataEngine({
          rowSizes: { shape: [1, 4], getDimensionLeftBoundaryByIndex: () => 20, getDimensionRightBoundaryByIndex: () => 50 },
          columnSizes: { shape: [1, 5] },
        }),
    };
    const event = {
      target: {
        properties: {
          region: CellRegion.ColumnHeader,
          startRowIndex: 0,
          startColIndex: 2,
          endColIndex: 3,
        },
      },
    };

    expect(selectionFromEvent(core, event)).toEqual(
      expect.objectContaining({ anchor: [0, 2], focus: [3, 3] }),
    );
    expect(selectionFromEvent(core, { target: null })).toBeNull();
    expect(selectionFromEvent(core, { target: { properties: {} } })).toBeNull();
  });

  it('builds whole-row and ordinary cell selection transactions after an editor exit', () => {
    const core = {
      getDataEngine: () =>
        createSheetFieldDataEngine({
          rowSizes: { shape: [1, 4], getDimensionLeftBoundaryByIndex: () => 20, getDimensionRightBoundaryByIndex: () => 50 },
          columnSizes: { shape: [1, 5] },
        }),
    };

    expect(
      selectionFromEvent(core, {
        target: {
          properties: { region: CellRegion.RowHeader, startRowIndex: 1, startColIndex: 0, endRowIndex: 2 },
        },
      }),
    ).toEqual(expect.objectContaining({ anchor: [1, 0], focus: [2, 4] }));
    expect(
      selectionFromEvent(core, {
        target: { properties: { startRowIndex: 1, startColIndex: 2, endRowIndex: 3, endColIndex: 4 } },
      }),
    ).toEqual(expect.objectContaining({ anchor: [1, 2], focus: [3, 4] }));

    expect(
      selectionFromEvent(core, {
        target: { properties: { region: CellRegion.RowHeader, startRowIndex: 1, startColIndex: 0 } },
      }),
    ).toEqual(expect.objectContaining({ anchor: [1, 0], focus: [1, 4] }));

    expect(
      selectionFromEvent(core, {
        target: { properties: { region: CellRegion.ColumnHeader, startRowIndex: 0, startColIndex: 2 } },
      }),
    ).toEqual(expect.objectContaining({ anchor: [0, 2], focus: [3, 2] }));

    expect(
      selectionFromEvent(
        { getDataEngine: () => ({ getDataType: () => void 0 }) },
        {
          target: {
            properties: { region: CellRegion.RowHeader, startRowIndex: 2, startColIndex: 0, endRowIndex: 3 },
          },
        },
      ),
    ).toBeNull();

    expect(
      selectionFromEvent(
        { getDataEngine: () => ({ getDataType: () => void 0 }) },
        {
          target: {
            properties: { region: CellRegion.ColumnHeader, startRowIndex: 0, startColIndex: 1, endColIndex: 2 },
          },
        },
      ),
    ).toBeNull();
  });

  it('moves the document cursor to the click position inside the editor', () => {
    const editor = createEditorReducer();
    const session = openEditorWithSession(editor);
    editor.docInputPlugin = {
      clearSession: jest.fn(),
      session: {
        lastSnapshot: {},
        preferredX: 12,
        docSelection: {
          anchor: { path: [0, 0], offset: 0 },
          head: { path: [0, 0], offset: 0 },
        },
      },
    } as never;
    editor.searCoreDoc = { resolveCursorFromPoint: jest.fn(() => ({ path: [1, 0], offset: 4 })) };
    const handlePointer = jest.spyOn(session, 'handlePointer').mockImplementation(() => ({
      needsRedraw: false,
      selection: { anchor: { path: [1, 0], offset: 4 }, head: { path: [1, 0], offset: 4 } },
    }));
    editor.core = { requestRender: jest.fn() };
    editor.blinker = { stop: jest.fn(), reset: jest.fn() };
    editor.requestRerender = jest.fn();

    executeLocalActions();
    const commands = bus;
    commands.run(HandleCellEditorPointerCommand, { type: 'pointerDown', point: { x: 25, y: 36 } });

    expect(handlePointer).toHaveBeenCalled();
  });

  it('releases pointer capture after editor drag selection completes', () => {
    const editor = createEditorReducer();
    openEditorForTest(editor);
    Object.assign(dependencies.keyboardRouter, { stopListener: jest.fn() });
    const disposePointerCapture = jest.fn();
    Object.assign(dependencies.pointerCapture, { start: jest.fn(() => disposePointerCapture) });
    beginDragForTest(editor);

    expect(editor.onMouseUp({}, {})).toBe(false);
    expect(disposePointerCapture).toHaveBeenCalledTimes(1);
    expect(editor.onMouseUp({}, {})).toBeUndefined();
  });

  it('keeps double-click handling with downstream selection when no editable cell target exists', () => {
    const editor = createEditorReducer();

    expect(editor.onDblClick({}, { target: null })).toBe(true);
    expect(editor.onDblClick({}, { target: { properties: { startRowIndex: 0 } } })).toBe(true);
    expect(editor.onDblClick({}, { target: { properties: { startColIndex: 0 } } })).toBe(true);
    expect(
      editor.onDblClick(
        {},
        {
          target: {
            properties: {
              region: CellRegion.ColumnHeader,
              startRowIndex: 0,
              startColIndex: 0,
            },
          },
        },
      ),
    ).toBe(true);
  });

  it('starts editing on the second mouse down when a retained target loses dblclick', () => {
    const editor = createEditorReducer();
    const open = jest.spyOn(editor, 'onDblClick').mockReturnValue(false);
    const event = {
      clickCount: 2,
      origin: { detail: 2, preventDefault: jest.fn() },
      target: { properties: { region: CellRegion.Grid, startRowIndex: 1, startColIndex: 3 } },
    };

    expect((editor as unknown as SheetCellEditorPlugin).onMouseDown({} as never, event as never)).toBe(false);
    expect(open).toHaveBeenCalledWith({}, event);
    expect(event.origin.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('requests a render only while an edit session is active', () => {
    const editor = createEditorReducer();
    const core = openEditorForTest(editor);
    executeLocalActions();
    bus.run(RequestCellEditorRenderCommand, void 0);
    expect(core.requestRender).toHaveBeenCalledWith(editor);
    createExecutePipelineSpy();
    editor.cancelEdit(core);
    core.requestRender.mockClear();
    executeLocalActions();
    bus.run(RequestCellEditorRenderCommand, void 0);
    expect(core.requestRender).not.toHaveBeenCalled();
  });
  it('BUG-924 reads a merged cell from its anchor in the formula bar', () => {
    const editor = createEditorReducer() as unknown as {
      mergePlugin: { isMergedCell: jest.Mock };
      selectionPlugin: { getState: jest.Mock };
      bindCore(core: SearCoreSheet): void;
      readFormulaBarState(): {
        cell: [number, number];
        range: { start: [number, number]; end: [number, number] };
        text: string;
      };
    };
    const getItem = jest.fn((_row: number, column: number) =>
      column === 0
        ? { type: 'string', value: 'merged value' }
        : { type: 'formula', formula: '=A1', value: 'merged value' },
    );
    Object.assign(dependencies.mergePlugin, {
      isMergedCell: jest.fn(
        () =>
          new Rect([
            [0, 0],
            [0, 3],
          ]),
      ),
    });
    Object.assign(dependencies.selectionPlugin, {
      getState: jest.fn(() => [
        new Rect([
          [0, 1],
          [0, 1],
        ]),
        new Rect([
          [0, 0],
          [0, 3],
        ]),
      ]),
    });
    editor.bindCore({ getDataEngine: () => createSheetFieldDataEngine({ sheetData: { getItem } }) } as never);

    const observations = new ObservationRegistry();
    (editor as unknown as SheetCellEditorPlugin).registerObservations(observations);
    expect(observations.getSnapshot(SheetFormulaBarObservation)).toMatchObject({
      cell: [0, 0],
      range: { start: [0, 0], end: [0, 3] },
      text: 'merged value',
    });
    expect(dependencies.mergePlugin.isMergedCell).toHaveBeenCalledWith(0, 1);
    expect(getItem).toHaveBeenCalledWith(0, 0);
  });

  it('enters edit mode from a formula cell using its persisted formula source', () => {
    const editor = createEditorReducer() as unknown as {
      pluginKey: PluginKey;
      mergePlugin: { isMergedCell: jest.Mock };
      highlighter: { clear: jest.Mock };
      docInputPlugin: {
        session: { pendingDoc: unknown[]; docSelection: unknown };
        resetSession: jest.Mock;
      };
      originalDoc: unknown[];
      isEditing: boolean;
      originalContentWidth: number;
      textInput: { startListener: jest.Mock };
      keyboardRouter: { startListener: jest.Mock };
      blinker: { start: jest.Mock };
      cursorEngine: { override: jest.Mock };
      searCoreDoc: ReturnType<typeof createDocCoreMock>;
      subscribeEditHandlers: jest.Mock;
      onDblClick(core: object, event: object): boolean;
    };
    editor.pluginKey = new PluginKey('editor');
    Object.assign(dependencies.mergePlugin, { isMergedCell: jest.fn(() => null) });
    Object.assign(dependencies.highlighter, { clear: jest.fn() });
    const session: { pendingDoc: unknown[]; docSelection: unknown } = { pendingDoc: [], docSelection: null };
    editor.docInputPlugin = {
      session,
      resetSession: jest.fn((doc: unknown[], selection: unknown) => {
        session.pendingDoc = doc;
        session.docSelection = selection;
      }),
    };
    Object.assign(dependencies.textInput, { startListener: jest.fn() });
    Object.assign(dependencies.keyboardRouter, { startListener: jest.fn() });
    editor.blinker = { start: jest.fn() };
    Object.assign(dependencies.cursorEngine, { override: jest.fn() });
    editor.subscribeEditHandlers = jest.fn();
    container.registerInstance(DocNodeRegistry.symbol, DocNodeRegistry as never);
    registerCellEditorDocNodes();
    const docCore = createDocCoreMock(36);
    editor.searCoreDoc = docCore;
    container.registerInstance(SearCoreDoc.symbol, docCore as never);
    const executePipeline = createExecutePipelineSpy();
    const core = {
      getDataEngine: () =>
        createSheetFieldDataEngine({
          sheetData: { getItem: () => ({ type: 'formula', formula: '=A1+1', value: 999 }) },
          rowSizes: { shape: [1, 4], getDimensionLeftBoundaryByIndex: () => 20, getDimensionRightBoundaryByIndex: () => 50 },
          columnSizes: { shape: [1, 5] },
        }),
      configEngine: { getDefaultConfig: () => ({ cellPadding: 3 }) },
      renderEngine: { renderContext: { measureText: () => ({ width: 0 }) } },
      executePipeline,
    };
    const event = { target: { properties: { startRowIndex: 1, startColIndex: 2 } } };

    expect(editor.onDblClick(core, event)).toBe(false);
    expect(dependencies.mergePlugin.isMergedCell).toHaveBeenCalledWith(1, 2);
    expect(dependencies.highlighter.clear).toHaveBeenCalledTimes(1);
    expect(isCellEditing(editor)).toBe(true);
    expect(JSON.stringify(activeDocument(editor))).toContain('=A1+1');
    expect(executePipeline).toHaveBeenCalledTimes(2);
    expect(dependencies.textInput.startListener).toHaveBeenCalledTimes(1);
    expect(dependencies.keyboardRouter.subscribe).toHaveBeenCalled();
    expect(dependencies.keyboardRouter.startListener).toHaveBeenCalledTimes(1);
    expect(dependencies.platform.setInterval).toHaveBeenCalledTimes(1);
    expect(dependencies.cursorEngine.override).toHaveBeenCalledWith('text');
  });

  it('enters edit mode from rich-doc array cell value', () => {
    const editor = createEditorReducer() as unknown as {
      pluginKey: PluginKey;
      mergePlugin: { isMergedCell: jest.Mock };
      highlighter: { clear: jest.Mock };
      docInputPlugin: {
        session: { pendingDoc: unknown[]; docSelection: unknown };
        resetSession: jest.Mock;
      };
      originalDoc: unknown[];
      isEditing: boolean;
      originalContentWidth: number;
      textInput: { startListener: jest.Mock };
      keyboardRouter: { startListener: jest.Mock };
      blinker: { start: jest.Mock };
      cursorEngine: { override: jest.Mock };
      searCoreDoc: ReturnType<typeof createDocCoreMock>;
      subscribeEditHandlers: jest.Mock;
      onDblClick(core: object, event: object): boolean;
    };

    editor.pluginKey = new PluginKey('editor');
    Object.assign(dependencies.mergePlugin, { isMergedCell: jest.fn(() => null) });
    Object.assign(dependencies.highlighter, { clear: jest.fn() });
    const session: { pendingDoc: unknown[]; docSelection: unknown } = { pendingDoc: [], docSelection: null };
    editor.docInputPlugin = {
      session,
      resetSession: jest.fn((doc: unknown[], selection: unknown) => {
        session.pendingDoc = doc;
        session.docSelection = selection;
      }),
    };
    Object.assign(dependencies.textInput, { startListener: jest.fn() });
    Object.assign(dependencies.keyboardRouter, { startListener: jest.fn() });
    editor.blinker = { start: jest.fn() };
    Object.assign(dependencies.cursorEngine, { override: jest.fn() });
    editor.subscribeEditHandlers = jest.fn();

    container.registerInstance(DocNodeRegistry.symbol, new DocNodeRegistry() as never);
    registerCellEditorDocNodes();
    const docCore = createDocCoreMock(34);
    editor.searCoreDoc = docCore;
    container.registerInstance(SearCoreDoc.symbol, docCore as never);

    const richDoc = stringToRichDoc('from-rich-doc');
    const core = {
      getDataEngine: () =>
        createSheetFieldDataEngine({
          sheetData: { getItem: () => ({ value: richDoc }) },
          rowSizes: { shape: [1, 4], getDimensionLeftBoundaryByIndex: () => 20, getDimensionRightBoundaryByIndex: () => 50 },
          columnSizes: { shape: [1, 5] },
        }),
      configEngine: { getDefaultConfig: () => ({ cellPadding: 3 }) },
      renderEngine: { renderContext: { measureText: () => ({ width: 0 }) } },
      executePipeline: createExecutePipelineSpy(),
    };

    expect(editor.onDblClick(core, { target: { properties: { startRowIndex: 0, startColIndex: 0 } } })).toBe(false);
    expect(activeDocument(editor)).toEqual(richDoc);
  });

  it('enters edit mode using merged bounds and default cell-padding fallback', () => {
    const editor = createEditorReducer() as unknown as {
      pluginKey: PluginKey;
      mergePlugin: { isMergedCell: jest.Mock };
      highlighter: { clear: jest.Mock };
      docInputPlugin: {
        session: { pendingDoc: unknown[]; docSelection: unknown };
        resetSession: jest.Mock;
      };
      originalDoc: unknown[];
      isEditing: boolean;
      originalContentWidth: number;
      textInput: { startListener: jest.Mock };
      keyboardRouter: { startListener: jest.Mock };
      blinker: { start: jest.Mock };
      cursorEngine: { override: jest.Mock };
      searCoreDoc: ReturnType<typeof createDocCoreMock>;
      subscribeEditHandlers: jest.Mock;
      onDblClick(core: object, event: object): boolean;
    };
    editor.pluginKey = new PluginKey('editor');
    Object.assign(dependencies.mergePlugin, {
      isMergedCell: jest.fn(
        () =>
          new Rect([
            [1, 2],
            [2, 3],
          ]),
      ),
    });
    Object.assign(dependencies.highlighter, { clear: jest.fn() });
    const session: { pendingDoc: unknown[]; docSelection: unknown } = { pendingDoc: [], docSelection: null };
    editor.docInputPlugin = {
      session,
      resetSession: jest.fn((doc: unknown[], selection: unknown) => {
        session.pendingDoc = doc;
        session.docSelection = selection;
      }),
    };
    Object.assign(dependencies.textInput, { startListener: jest.fn() });
    Object.assign(dependencies.keyboardRouter, { startListener: jest.fn() });
    editor.blinker = { start: jest.fn() };
    Object.assign(dependencies.cursorEngine, { override: jest.fn() });
    editor.subscribeEditHandlers = jest.fn();

    container.registerInstance(DocNodeRegistry.symbol, new DocNodeRegistry() as never);
    registerCellEditorDocNodes();
    const docCore = createDocCoreMock(28);
    editor.searCoreDoc = docCore;
    container.registerInstance(SearCoreDoc.symbol, docCore as never);

    const executePipeline = createExecutePipelineSpy();
    const core = {
      getDataEngine: () =>
        createSheetFieldDataEngine({
          sheetData: { getItem: () => ({ value: 'merged-value' }) },
          rowSizes: { shape: [1, 4], getDimensionLeftBoundaryByIndex: () => 20, getDimensionRightBoundaryByIndex: () => 50 },
          columnSizes: { shape: [1, 5] },
        }),
      configEngine: { getDefaultConfig: () => ({}) },
      renderEngine: { renderContext: { measureText: () => ({ width: 0 }) } },
      executePipeline,
    };

    expect(editor.onDblClick(core, { target: { properties: { startRowIndex: 1, startColIndex: 2 } } })).toBe(false);
    expect(dependencies.mergePlugin.isMergedCell).toHaveBeenCalledWith(1, 2);
    expect(activeDocument(editor)).toEqual(stringToRichDoc('merged-value'));
  });

  it('captures pointer interaction inside the editor without delegating to sheet selection', () => {
    const editor = createEditorReducer() as unknown as {
      isEditing: boolean;
      isDragSelecting: boolean;
      lastEditorRect: { x: number; y: number; width: number; height: number } | null;
      coordinates: { viewToWorld: jest.Mock };
      runCellEditorCommand: jest.Mock;
      pointerCapture: { start: jest.Mock };
      textInput: { refocus: jest.Mock };
      onMouseDown(core: object, event: object): boolean | void;
    };
    openEditorForTest(editor as unknown as EditorReducer);
    editor.lastEditorRect = { x: 10, y: 20, width: 40, height: 30 };
    Object.assign(dependencies.coordinates, { viewToWorld: jest.fn(() => ({ x: 25, y: 36 })) });
    renderEditor(editor);
    const runCellEditorCommand = jest.spyOn(bus, 'run');
    let release: (() => void) | undefined;
    Object.assign(dependencies.pointerCapture, {
      start: jest.fn((handlers: { onRelease: () => void }) => {
        release = handlers.onRelease;
        return jest.fn();
      }),
    });
    Object.assign(dependencies.textInput, { refocus: jest.fn() });
    executeLocalActions();
    const preventDefault = jest.fn();
    const core = {
      renderEngine: { scrollManager: { getState: () => ({ x: 3, y: 4 }) } },
      requestRender: jest.fn(),
    };
    const event = { origin: { offsetX: 12, offsetY: 16, preventDefault } };

    expect(editor.onMouseDown(core, event)).toBe(false);
    expect(dependencies.coordinates.viewToWorld).toHaveBeenCalledWith({ x: 12, y: 16 }, { x: 3, y: 4 });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(runCellEditorCommand).toHaveBeenCalledWith(HandleCellEditorPointerCommand, {
      type: 'pointerDown',
      point: { x: 25, y: 36 },
      clickCount: 1,
    });
    expect(runCellEditorCommand).toHaveBeenCalledWith(BeginCellEditorDragSelectionCommand, void 0);
    expect(dependencies.pointerCapture.start).toHaveBeenCalledTimes(1);
    expect(dependencies.textInput.refocus).toHaveBeenCalledTimes(1);

    expect(editor.onMouseDown(core, { ...event, clickCount: 2 })).toBe(false);
    expect(runCellEditorCommand).toHaveBeenCalledWith(HandleCellEditorPointerCommand, {
      type: 'pointerDown',
      point: { x: 25, y: 36 },
      clickCount: 2,
    });

    release?.();
    expect(runCellEditorCommand).toHaveBeenCalledWith(EndCellEditorDragSelectionCommand, {
      disposeCapture: false,
    });
  });

  it('returns without handling mouse down when editor is not active', () => {
    const editor = createEditorReducer() as unknown as {
      isEditing: boolean;
      onMouseDown(core: object, event: object): boolean | void;
    };
    expect(editor.onMouseDown({}, { origin: { offsetX: 0, offsetY: 0 } })).toBe(void 0);
  });

  it('clamps drag selection to editor bounds and updates only the document selection head', () => {
    const editor = createEditorReducer() as unknown as {
      isEditing: boolean;
      isDragSelecting: boolean;
      lastEditorRect: { x: number; y: number; width: number; height: number } | null;
      coordinates: { viewToWorld: jest.Mock };
      searCoreDoc: { resolveCursorFromPoint: jest.Mock };
      editSession: EditorReducer['editSession'];
      core: { requestRender: jest.Mock };
      docInputPlugin: {
        session: {
          lastSnapshot: object;
          docSelection: {
            anchor: { path: [number, number]; offset: number };
            head: { path: [number, number]; offset: number };
          };
          preferredX: number | null;
        };
      };
      blinker: { reset: jest.Mock };
      requestRerender: jest.Mock;
      onMouseMove(core: object, event: object): boolean | void;
    };
    const snapshot = {};
    const session = openEditorWithSession(editor as unknown as EditorReducer);
    beginDragForTest(editor as unknown as EditorReducer);
    renderEditor(editor);
    editor.lastEditorRect = { x: 10, y: 20, width: 40, height: 30 };
    Object.assign(dependencies.coordinates, { viewToWorld: jest.fn(() => ({ x: 100, y: -10 })) });
    editor.searCoreDoc = { resolveCursorFromPoint: jest.fn(() => ({ path: [0, 0], offset: 7 })) };
    const handlePointer = jest.spyOn(session, 'handlePointer').mockImplementation(() => ({
      needsRedraw: false,
      selection: { anchor: { path: [0, 0], offset: 2 }, head: { path: [0, 0], offset: 7 } },
    }));
    editor.core = { requestRender: jest.fn() };
    editor.docInputPlugin = {
      session: {
        lastSnapshot: snapshot,
        docSelection: {
          anchor: { path: [0, 0], offset: 2 },
          head: { path: [0, 0], offset: 3 },
        },
        preferredX: 14,
      },
    };
    editor.blinker = { reset: jest.fn() };
    editor.requestRerender = jest.fn();
    const core = { requestRender: jest.fn(), renderEngine: { scrollManager: { getState: () => ({ x: 2, y: 4 }) } } };

    expect(editor.onMouseMove(core, { origin: { offsetX: 60, offsetY: 0 } })).toBe(false);
    expect(handlePointer).toHaveBeenCalled();
  });

  it('ignores pointer moves until the drag command starts a selection', () => {
    const editor = createEditorReducer();
    openEditorForTest(editor);
    const runCommand = jest.spyOn(bus, 'run');

    expect(editor.onMouseMove({} as never, {} as never)).toBeUndefined();
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('stages the next selection when an edit ends on an outside click', () => {
    const editor = createEditorReducer();
    openEditorForTest(editor);
    const core = renderEditor(editor);
    const execute = createExecutePipelineSpy();
    const plugin = editor as unknown as SheetCellEditorPlugin;
    plugin.onMouseDown(core as never, {
      origin: { offsetX: 200, offsetY: 200, preventDefault: jest.fn() },
      target: { properties: { startRowIndex: 2, startColIndex: 3 } },
    } as never);
    const pipeline: Pipeline = execute.mock.calls[0][0];
    expect(pipeline.steps).toContainEqual(expect.objectContaining({
      interaction: expect.objectContaining({ anchor: [2, 3], focus: [2, 3], source: 'pointer' }),
    }));
    expect(isCellEditing(editor)).toBe(false);
  });

  it.each(['commit', 'cancel'] as const)('finishes the active edit session on %s', (action) => {
    const editor = createEditorReducer();
    const plugin = editor as unknown as SheetCellEditorPlugin;
    const execute = createExecutePipelineSpy();
    plugin.commitEdit({} as never);
    plugin.cancelEdit({} as never);
    expect(execute).not.toHaveBeenCalled();
    const core = openEditorForTest(editor);
    execute.mockClear();
    if (action === 'commit') plugin.commitEdit(core as never);
    else plugin.cancelEdit(core as never);
    const pipeline: Pipeline = execute.mock.calls[0][0];
    expect(pipeline.steps).toContainEqual(expect.objectContaining({
      interaction: expect.objectContaining({ reason: action }),
    }));
    expect(isCellEditing(editor)).toBe(false);
  });
});
