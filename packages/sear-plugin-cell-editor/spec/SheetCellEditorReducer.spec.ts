import { Rect } from '@searsuite/sear-foundation-rect';
import { RectOTActionName } from '@searsuite/sear-domain-ot';
import { createTransaction, Transaction } from '@searsuite/sear-domain-transaction';
import { PluginKey } from '@searsuite/sear-assembly-plugin';
import { DocCursorManager, Pipeline, SearCoreDoc, SearCoreSheet } from '@searsuite/sear-assembly-core';
import { Container } from '@searsuite/sear-foundation-di';
import { CellRegion } from '@searsuite/sear-render-registry';
import { DocNodeRegistry, stringToRichDoc } from '@searsuite/sear-domain-doc';
import { SheetCellEditorPlugin } from '../src/SheetCellEditor';
import { FormulaAutoCloseTracker } from '../src/formulaAssist/FormulaAutoCloseTracker';
import {
  BeginCellEditorDragSelectionCommand,
  CancelCellEditCommand,
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

function createEditorReducer(commands = new SheetCommandBus()): EditorReducer {
  if (!commands.has(EnsureSelectionVisibleCommand)) {
    commands.register(EnsureSelectionVisibleCommand,
      () => new LocalActionCommand(EnsureSelectionVisibleCommand.id, () => void 0));
  }
  const editor = new SheetCellEditorPlugin(
    { isMergedCell: jest.fn() } as never,
    {
      getState: jest.fn(() => [
        new Rect([
          [-1, -1],
          [-1, -1],
        ]),
      ]),
      onFillHandleDoubleClick: jest.fn(() => false),
    } as never,
    { subscribe: jest.fn() } as never,
    { subscribe: jest.fn() } as never,
    { start: jest.fn(() => jest.fn()) } as never,
    { register: jest.fn(), resolve: jest.fn(() => 'default') } as never,
    { override: jest.fn() } as never,
    { setInterval: jest.fn(), clearInterval: jest.fn() } as never,
    { commit: jest.fn() } as never,
    { clear: jest.fn() } as never,
    { viewToWorld: jest.fn(), worldToView: jest.fn() } as never,
    { register: jest.fn(), get: jest.fn() } as never,
    new FakeSheetEmbeddedEditor(),
    commands,
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
  const adapter = (editor as unknown as { embeddedEditor: FakeSheetEmbeddedEditor }).embeddedEditor;
  return adapter.editContexts[0].documentAccessor.read();
}

function openEditorForTest(editor: EditorReducer, value: unknown = 'draft') {
  const internals = editor as unknown as {
    mergePlugin: { isMergedCell: jest.Mock };
    textInput: { startListener: jest.Mock; stopListener: jest.Mock };
    keyboardRouter: { startListener: jest.Mock; stopListener: jest.Mock };
    blinker: { start: jest.Mock; stop: jest.Mock; reset: jest.Mock };
    subscribeEditHandlers: jest.Mock;
  };
  internals.mergePlugin = { isMergedCell: jest.fn(() => null) };
  internals.textInput = { startListener: jest.fn(), stopListener: jest.fn() };
  internals.keyboardRouter = { startListener: jest.fn(), stopListener: jest.fn() };
  internals.blinker = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
  internals.subscribeEditHandlers = jest.fn();
  if (!currentExecutePipeline) createExecutePipelineSpy();
  const core = {
    getDataEngine: () =>
      createSheetFieldDataEngine({
        sheetData: { getItem: () => ({ type: 'string', value }) },
        rowSizes: { shape: [1, 4] },
        columnSizes: { shape: [1, 4] },
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
  const adapter = (editor as unknown as { embeddedEditor: FakeSheetEmbeddedEditor }).embeddedEditor;
  const createSession = adapter.createEditSession.bind(adapter);
  let activeSession: SheetEditSession | null = null;
  jest.spyOn(adapter, 'createEditSession').mockImplementation((context) => {
    activeSession = createSession(context);
    return activeSession;
  });
  openEditorForTest(editor);
  return activeSession!;
}

function executeLocalActions(): void {
  createExecutePipelineSpy((pipeline) => pipeline.steps.forEach((step) => step.localAction?.()));
}

function beginDragForTest(editor: EditorReducer): void {
  executeLocalActions();
  const commands = (editor as unknown as { getCommandBus(): SheetCommandBus }).getCommandBus();
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
    const commandReader = editor as unknown as {
      getCommandBus(): SheetCommandBus | null;
      resolveCore(): SearCoreSheet;
    };
    const registeredBus = commandReader.getCommandBus();
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
    expect(commandReader.getCommandBus()).toBe(registeredBus);
    expect(() => commandReader.resolveCore()).toThrow('not bound');
  });
  it('keeps an active edit session independent of forged writable properties', () => {
    const editor = createEditorReducer();
    const session = openEditorWithSession(editor);
    const forgedInput = jest.fn();
    const forgedReconcile = jest.fn();
    const boundCore = (editor as unknown as { resolveCore(): SearCoreSheet }).resolveCore();
    Object.assign(editor, {
      isEditing: false,
      editSession: { handleInput: forgedInput },
      sessionState: { pendingDoc: stringToRichDoc('forged') },
      session: { pendingDoc: stringToRichDoc('forged') },
      core: { requestRender: jest.fn() },
      formulaAutoClose: { reconcile: forgedReconcile },
    });

    expect(isCellEditing(editor)).toBe(true);
    expect((editor as unknown as { resolveCore(): SearCoreSheet }).resolveCore()).toBe(boundCore);
    expect(() => (editor as unknown as SheetCellEditorPlugin).bindCore({} as never)).toThrow('already bound');
    expect(JSON.stringify(activeDocument(editor))).toContain('draft');
    editor.lastEditorRect = { x: 0, y: 0, width: 100, height: 30 };
    executeLocalActions();
    const handleInput = jest.spyOn(session, 'handleInput');
    const commands = (editor as unknown as { getCommandBus(): SheetCommandBus }).getCommandBus();
    commands.run(HandleDocumentInputCommand, { kind: 'text', text: 'z' });

    expect(handleInput).toHaveBeenCalled();
    expect(forgedInput).not.toHaveBeenCalled();
    expect(forgedReconcile).not.toHaveBeenCalled();
    expect(JSON.stringify(activeDocument(editor))).toContain('draftz');
  });
  it('isolates embedded editor document reads before and after session creation', () => {
    const editor = createEditorReducer();
    const adapter = (editor as unknown as { embeddedEditor: FakeSheetEmbeddedEditor }).embeddedEditor;
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
    editor.textInput = { startListener, stopListener: jest.fn() } as never;
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

  it('cleans up editor resources and marks a separate left-overflow dirty region', () => {
    const editor = createEditorReducer();
    openEditorForTest(editor);
    const clearCursor = jest.fn();
    container.registerInstance(DocCursorManager.symbol, { clearCursor } as never);
    editor.docCursorManager = { clearCursor };
    editor.pluginKey = new PluginKey('test-editor');
    editor.blinker = { stop: jest.fn(), reset: jest.fn() };
    editor.keyboardRouter = { stopListener: jest.fn() };
    const disposePointerCapture = jest.fn();
    editor.pointerCapture = { start: jest.fn(() => disposePointerCapture) };
    beginDragForTest(editor);
    editor.docInputPlugin = { clearSession: jest.fn(), session: { docSelection: {} } } as never;
    editor.highlighter = { clear: jest.fn() };
    editor.cursorEngine = { override: jest.fn() };
    editor.textInput = { stopListener: jest.fn() };
    editor.originalDoc = [{}];
    editor.originalContentWidth = 80;
    editor.lastEditorRect = { x: 10, y: 20, width: 30, height: 40 };
    editor.lastOverflowLeftX = 4;
    const core = { renderEngine: { markDirty: jest.fn() } };

    const result = editor.performCleanup(core);

    expect(result.dirtyRects).toEqual([
      expect.objectContaining({ x: 10, y: 20, width: 30, height: 40 }),
      expect.objectContaining({ x: 4, y: 20, width: 5, height: 40 }),
    ]);
    expect(core.renderEngine.markDirty).not.toHaveBeenCalled();
    expect(editor.blinker.stop).not.toHaveBeenCalled();
    expect(isCellEditing(editor)).toBe(true);
    expect(editor.lastEditorRect).not.toBeNull();

    createExecutePipelineSpy();
    editor.cancelEdit(core as never);
    expect(editor.blinker.stop).toHaveBeenCalledTimes(1);
    expect(disposePointerCapture).toHaveBeenCalledTimes(1);
    expect(editor.keyboardRouter.stopListener).not.toHaveBeenCalled();
    expect(editor.highlighter.clear).toHaveBeenCalledTimes(1);
    expect(editor.cursorEngine.override).toHaveBeenCalledWith(null);
    expect(editor.textInput.stopListener).not.toHaveBeenCalled();
    expect(isCellEditing(editor)).toBe(false);
    expect(editor.lastEditorRect).toBeNull();
    expect(editor.lastOverflowLeftX).toBeNull();
  });

  it('cleanup does not mark dirty when there is no cached editor rect', () => {
    const editor = createEditorReducer();
    const clearCursor = jest.fn();
    container.registerInstance(DocCursorManager.symbol, { clearCursor } as never);
    editor.docCursorManager = { clearCursor };
    editor.pluginKey = new PluginKey('test-editor');
    editor.blinker = { stop: jest.fn(), reset: jest.fn() };
    editor.keyboardRouter = { stopListener: jest.fn() };
    editor.disposePointerCapture = jest.fn();
    editor.docInputPlugin = { clearSession: jest.fn(), session: { docSelection: {} } } as never;
    editor.highlighter = { clear: jest.fn() };
    editor.cursorEngine = { override: jest.fn() };
    editor.textInput = { stopListener: jest.fn() };
    editor.lastEditorRect = null;
    editor.lastOverflowLeftX = 4;

    const core = { renderEngine: { markDirty: jest.fn() } };
    const result = editor.performCleanup(core as never);

    expect(result.dirtyRects).toEqual([]);
    expect(core.renderEngine.markDirty).not.toHaveBeenCalled();
  });

  it('cleanup skips overflow dirty mark when computed overflow width is zero', () => {
    const editor = createEditorReducer();
    const clearCursor = jest.fn();
    container.registerInstance(DocCursorManager.symbol, { clearCursor } as never);
    editor.docCursorManager = { clearCursor };
    editor.pluginKey = new PluginKey('test-editor');
    editor.blinker = { stop: jest.fn(), reset: jest.fn() };
    editor.keyboardRouter = { stopListener: jest.fn() };
    editor.disposePointerCapture = jest.fn();
    editor.docInputPlugin = { clearSession: jest.fn(), session: { docSelection: {} } } as never;
    editor.highlighter = { clear: jest.fn() };
    editor.cursorEngine = { override: jest.fn() };
    editor.textInput = { stopListener: jest.fn() };
    editor.lastEditorRect = { x: 10, y: 20, width: 30, height: 40 };
    editor.lastOverflowLeftX = 9;

    const core = { renderEngine: { markDirty: jest.fn() } };
    const result = editor.performCleanup(core as never);

    expect(result.dirtyRects).toEqual([expect.objectContaining({ x: 10, y: 20, width: 30, height: 40 })]);
    expect(core.renderEngine.markDirty).not.toHaveBeenCalled();
  });

  it('builds a whole-column selection transaction when editing is interrupted from a column header', () => {
    const editor = createEditorReducer();
    editor.selectionPlugin = { pluginKey: new PluginKey('selection') };
    const core = {
      getDataEngine: () =>
        createSheetFieldDataEngine({
          rowSizes: { shape: [1, 4] },
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

    expect(editor.buildSelectionUpdate(core, event)).toEqual(
      expect.objectContaining({ anchor: [0, 2], focus: [3, 3] }),
    );
    expect(editor.buildSelectionUpdate(core, { target: null })).toBeNull();
    expect(editor.buildSelectionUpdate(core, { target: { properties: {} } })).toBeNull();
  });

  it('builds whole-row and ordinary cell selection transactions after an editor exit', () => {
    const editor = createEditorReducer();
    editor.selectionPlugin = { pluginKey: new PluginKey('selection') };
    const core = {
      getDataEngine: () =>
        createSheetFieldDataEngine({
          rowSizes: { shape: [1, 4] },
          columnSizes: { shape: [1, 5] },
        }),
    };

    expect(
      editor.buildSelectionUpdate(core, {
        target: {
          properties: { region: CellRegion.RowHeader, startRowIndex: 1, startColIndex: 0, endRowIndex: 2 },
        },
      }),
    ).toEqual(expect.objectContaining({ anchor: [1, 0], focus: [2, 4] }));
    expect(
      editor.buildSelectionUpdate(core, {
        target: { properties: { startRowIndex: 1, startColIndex: 2, endRowIndex: 3, endColIndex: 4 } },
      }),
    ).toEqual(expect.objectContaining({ anchor: [1, 2], focus: [3, 4] }));

    expect(
      editor.buildSelectionUpdate(core, {
        target: { properties: { region: CellRegion.RowHeader, startRowIndex: 1, startColIndex: 0 } },
      }),
    ).toEqual(expect.objectContaining({ anchor: [1, 0], focus: [1, 4] }));

    expect(
      editor.buildSelectionUpdate(core, {
        target: { properties: { region: CellRegion.ColumnHeader, startRowIndex: 0, startColIndex: 2 } },
      }),
    ).toEqual(expect.objectContaining({ anchor: [0, 2], focus: [3, 2] }));

    expect(
      editor.buildSelectionUpdate(
        { getDataEngine: () => ({ getDataType: () => void 0 }) },
        {
          target: {
            properties: { region: CellRegion.RowHeader, startRowIndex: 2, startColIndex: 0, endRowIndex: 3 },
          },
        },
      ),
    ).toBeNull();

    expect(
      editor.buildSelectionUpdate(
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
    const commands = (editor as unknown as { getCommandBus(): SheetCommandBus }).getCommandBus();
    commands.run(HandleCellEditorPointerCommand, { type: 'pointerDown', point: { x: 25, y: 36 } });

    expect(handlePointer).toHaveBeenCalled();
  });

  it('releases pointer capture after editor drag selection completes', () => {
    const editor = createEditorReducer();
    openEditorForTest(editor);
    editor.keyboardRouter = { stopListener: jest.fn() };
    const disposePointerCapture = jest.fn();
    editor.pointerCapture = { start: jest.fn(() => disposePointerCapture) };
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

    editor.requestRerender();
    const core = openEditorForTest(editor);
    createExecutePipelineSpy((pipeline) => pipeline.steps.forEach((step) => step.localAction?.()));
    editor.requestRerender();

    expect(core.requestRender.mock.calls[0]?.[0]).toBe(editor);
    expect(core.requestRender).toHaveBeenCalledTimes(1);
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
    editor.mergePlugin = {
      isMergedCell: jest.fn(
        () =>
          new Rect([
            [0, 0],
            [0, 3],
          ]),
      ),
    };
    editor.selectionPlugin = {
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
    };
    editor.bindCore({ getDataEngine: () => createSheetFieldDataEngine({ sheetData: { getItem } }) } as never);

    expect(editor.readFormulaBarState()).toMatchObject({
      cell: [0, 0],
      range: { start: [0, 0], end: [0, 3] },
      text: 'merged value',
    });
    expect(editor.mergePlugin.isMergedCell).toHaveBeenCalledWith(0, 1);
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
    editor.mergePlugin = { isMergedCell: jest.fn(() => null) };
    editor.highlighter = { clear: jest.fn() };
    const session: { pendingDoc: unknown[]; docSelection: unknown } = { pendingDoc: [], docSelection: null };
    editor.docInputPlugin = {
      session,
      resetSession: jest.fn((doc: unknown[], selection: unknown) => {
        session.pendingDoc = doc;
        session.docSelection = selection;
      }),
    };
    editor.textInput = { startListener: jest.fn() };
    editor.keyboardRouter = { startListener: jest.fn() };
    editor.blinker = { start: jest.fn() };
    editor.cursorEngine = { override: jest.fn() };
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
          rowSizes: { shape: [1, 4] },
          columnSizes: { shape: [1, 5] },
        }),
      configEngine: { getDefaultConfig: () => ({ cellPadding: 3 }) },
      renderEngine: { renderContext: { measureText: () => ({ width: 0 }) } },
      executePipeline,
    };
    const event = { target: { properties: { startRowIndex: 1, startColIndex: 2 } } };

    expect(editor.onDblClick(core, event)).toBe(false);
    expect(editor.mergePlugin.isMergedCell).toHaveBeenCalledWith(1, 2);
    expect(editor.highlighter.clear).toHaveBeenCalledTimes(1);
    expect(isCellEditing(editor)).toBe(true);
    expect(JSON.stringify(activeDocument(editor))).toContain('=A1+1');
    expect(executePipeline).toHaveBeenCalledTimes(2);
    expect(editor.textInput.startListener).toHaveBeenCalledTimes(1);
    expect(editor.subscribeEditHandlers).toHaveBeenCalledTimes(1);
    expect(editor.keyboardRouter.startListener).toHaveBeenCalledTimes(1);
    expect(editor.blinker.start).toHaveBeenCalledTimes(1);
    expect(editor.cursorEngine.override).toHaveBeenCalledWith('text');
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
    editor.mergePlugin = { isMergedCell: jest.fn(() => null) };
    editor.highlighter = { clear: jest.fn() };
    const session: { pendingDoc: unknown[]; docSelection: unknown } = { pendingDoc: [], docSelection: null };
    editor.docInputPlugin = {
      session,
      resetSession: jest.fn((doc: unknown[], selection: unknown) => {
        session.pendingDoc = doc;
        session.docSelection = selection;
      }),
    };
    editor.textInput = { startListener: jest.fn() };
    editor.keyboardRouter = { startListener: jest.fn() };
    editor.blinker = { start: jest.fn() };
    editor.cursorEngine = { override: jest.fn() };
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
          rowSizes: { shape: [1, 4] },
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
    editor.mergePlugin = {
      isMergedCell: jest.fn(
        () =>
          new Rect([
            [1, 2],
            [2, 3],
          ]),
      ),
    };
    editor.highlighter = { clear: jest.fn() };
    const session: { pendingDoc: unknown[]; docSelection: unknown } = { pendingDoc: [], docSelection: null };
    editor.docInputPlugin = {
      session,
      resetSession: jest.fn((doc: unknown[], selection: unknown) => {
        session.pendingDoc = doc;
        session.docSelection = selection;
      }),
    };
    editor.textInput = { startListener: jest.fn() };
    editor.keyboardRouter = { startListener: jest.fn() };
    editor.blinker = { start: jest.fn() };
    editor.cursorEngine = { override: jest.fn() };
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
          rowSizes: { shape: [1, 4] },
          columnSizes: { shape: [1, 5] },
        }),
      configEngine: { getDefaultConfig: () => ({}) },
      renderEngine: { renderContext: { measureText: () => ({ width: 0 }) } },
      executePipeline,
    };

    expect(editor.onDblClick(core, { target: { properties: { startRowIndex: 1, startColIndex: 2 } } })).toBe(false);
    expect(editor.mergePlugin.isMergedCell).toHaveBeenCalledWith(1, 2);
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
    editor.coordinates = { viewToWorld: jest.fn(() => ({ x: 25, y: 36 })) };
    const runCellEditorCommand = jest.spyOn(editor, 'runCellEditorCommand');
    let release: (() => void) | undefined;
    editor.pointerCapture = {
      start: jest.fn((handlers: { onRelease: () => void }) => {
        release = handlers.onRelease;
        return jest.fn();
      }),
    };
    editor.textInput = { refocus: jest.fn() };
    executeLocalActions();
    const preventDefault = jest.fn();
    const core = {
      renderEngine: { scrollManager: { getState: () => ({ x: 3, y: 4 }) } },
      requestRender: jest.fn(),
    };
    const event = { origin: { offsetX: 12, offsetY: 16, preventDefault } };

    expect(editor.onMouseDown(core, event)).toBe(false);
    expect(editor.coordinates.viewToWorld).toHaveBeenCalledWith({ x: 12, y: 16 }, { x: 3, y: 4 });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(runCellEditorCommand).toHaveBeenCalledWith(core, HandleCellEditorPointerCommand, {
      type: 'pointerDown',
      point: { x: 25, y: 36 },
      clickCount: 1,
    });
    expect(runCellEditorCommand).toHaveBeenCalledWith(core, BeginCellEditorDragSelectionCommand, void 0);
    expect(editor.pointerCapture.start).toHaveBeenCalledTimes(1);
    expect(editor.textInput.refocus).toHaveBeenCalledTimes(1);

    expect(editor.onMouseDown(core, { ...event, clickCount: 2 })).toBe(false);
    expect(runCellEditorCommand).toHaveBeenCalledWith(core, HandleCellEditorPointerCommand, {
      type: 'pointerDown',
      point: { x: 25, y: 36 },
      clickCount: 2,
    });

    release?.();
    expect(runCellEditorCommand).toHaveBeenCalledWith(core, EndCellEditorDragSelectionCommand, {
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
    editor.lastEditorRect = { x: 10, y: 20, width: 40, height: 30 };
    editor.coordinates = { viewToWorld: jest.fn(() => ({ x: 100, y: -10 })) };
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
    const core = { renderEngine: { scrollManager: { getState: () => ({ x: 2, y: 4 }) } } };

    expect(editor.onMouseMove(core, { origin: { offsetX: 60, offsetY: 0 } })).toBe(false);
    expect(handlePointer).toHaveBeenCalled();
  });

  it('ignores pointer moves until the drag command starts a selection', () => {
    const editor = createEditorReducer();
    openEditorForTest(editor);
    const runCommand = jest.spyOn(editor as unknown as { runCellEditorCommand: jest.Mock }, 'runCellEditorCommand');

    expect(editor.onMouseMove({} as never, {} as never)).toBeUndefined();
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('builds an exit-and-select pipeline when clicking outside an active editor', () => {
    const pipeline = { add: jest.fn(), addInteraction: jest.fn() };
    const editor = createEditorReducer() as unknown as {
      isEditing: boolean;
      lastEditorRect: { x: number; y: number; width: number; height: number } | null;
      coordinates: { viewToWorld: jest.Mock };
      buildCommitPipeline: jest.Mock;
      buildSelectionUpdate: jest.Mock;
      appendEditExitInteraction: jest.Mock;
      selectionPlugin: { restartNavigation: jest.Mock };
      textInput: { refocus: jest.Mock };
      onMouseDown(core: object, event: object): boolean | void;
    };
    openEditorForTest(editor as unknown as EditorReducer);
    editor.lastEditorRect = { x: 10, y: 20, width: 40, height: 30 };
    editor.coordinates = { viewToWorld: jest.fn(() => ({ x: 100, y: 100 })) };
    editor.buildCommitPipeline = jest.fn(() => pipeline);
    editor.buildSelectionUpdate = jest.fn(() => ({
      anchor: [2, 3],
      focus: [2, 3],
    }));
    editor.appendEditExitInteraction = jest.fn();
    editor.selectionPlugin = { restartNavigation: jest.fn() };
    editor.textInput = { refocus: jest.fn() };
    const executePipeline = createExecutePipelineSpy();
    const core = { renderEngine: { scrollManager: { getState: () => ({ x: 0, y: 0 }) } }, executePipeline };
    const preventDefault = jest.fn();

    expect(editor.onMouseDown(core, { origin: { offsetX: 100, offsetY: 100, preventDefault } })).toBe(false);
    expect(editor.buildCommitPipeline).toHaveBeenCalledTimes(1);
    expect(pipeline.add).toHaveBeenCalledWith(
      'cell-editor.select-cell',
      expect.objectContaining({ operations: expect.any(Array) }),
    );
    expect(pipeline.addInteraction).toHaveBeenCalledWith(
      'selection.record-selection-change',
      expect.objectContaining({ anchor: [2, 3], focus: [2, 3], source: 'pointer' }),
    );
    expect(editor.appendEditExitInteraction).toHaveBeenCalledTimes(1);
    expect(executePipeline).toHaveBeenCalledWith(pipeline);
    expect(editor.selectionPlugin.restartNavigation).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(editor.textInput.refocus).toHaveBeenCalledTimes(1);
  });

  it('commits only active sessions and appends the commit exit interaction before execution', () => {
    const pipeline = {};
    const editor = createEditorReducer() as unknown as {
      isEditing: boolean;
      buildCommitPipeline: jest.Mock;
      appendEditExitInteraction: jest.Mock;
      commitEdit(core: { executePipeline: jest.Mock }): void;
    };
    editor.buildCommitPipeline = jest.fn(() => pipeline);
    editor.appendEditExitInteraction = jest.fn();
    const executePipeline = createExecutePipelineSpy();
    const core = { executePipeline };

    editor.commitEdit(core);
    openEditorForTest(editor as unknown as EditorReducer);
    editor.commitEdit(core);

    expect(editor.buildCommitPipeline).toHaveBeenCalledWith(core, 'cell-editor.commit-edit');
    expect(editor.appendEditExitInteraction).toHaveBeenCalledWith(pipeline, 'commit');
    expect(executePipeline).toHaveBeenCalledWith(pipeline);
  });

  it('restores the original document before cleaning up an active cancelled edit', () => {
    const editor = createEditorReducer() as unknown as {
      isEditing: boolean;
      originalDoc: unknown[];
      docInputPlugin: { resetSession: jest.Mock };
      createCancelCellEditCommand: jest.Mock;
      cancelEdit(core: object): void;
    };
    editor.originalDoc = [{ type: 'paragraph', content: [{ text: 'original' }] }];
    editor.docInputPlugin = { resetSession: jest.fn() };
    editor.createCancelCellEditCommand = jest.fn(() => ({
      id: CancelCellEditCommand.id,
      execute: () => ({ pipeline: { steps: [] } }),
    }));

    editor.cancelEdit({});
    openEditorForTest(editor as unknown as EditorReducer);
    const core = {};
    editor.cancelEdit(core);

    expect(editor.docInputPlugin.resetSession).not.toHaveBeenCalled();
    expect(editor.createCancelCellEditCommand).toHaveBeenCalledWith({ restoreOriginalDocument: true });
  });
});
