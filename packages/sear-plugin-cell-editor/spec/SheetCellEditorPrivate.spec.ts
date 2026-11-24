import { buildSelectionUpdate, resolveReferenceHighlightBounds } from '../src/SheetCellEditorGeometry';
import { Rect } from '@searsuite/sear-foundation-rect';
import { Container } from '@searsuite/sear-foundation-di';
import { SheetDataPlugin, SheetDataFieldNamespace, SheetDataMatrixFieldKey } from '@searsuite/sear-render-engine';
import { SheetAlignmentPlugin, SheetHorizontalAlignmentFieldKey } from '@searsuite/sear-plugin-alignment';
import {
  SheetColumnHiddenOriginalSizesFieldKey,
  SheetColumnSizesFieldKey,
  SheetRowHiddenOriginalSizesFieldKey,
  SheetRowSizesFieldKey,
} from '@searsuite/sear-plugin-resize';
import { CellRegion } from '@searsuite/sear-render-registry';
import { DocNodeRegistry } from '@searsuite/sear-domain-doc';
import { CellRangeHighlightKind } from '../src/Highlighter';
import { SheetCellEditorPlugin } from '../src/SheetCellEditor';
import { LocalActionCommand, SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { EnsureSelectionVisibleCommand } from '@searsuite/sear-plugin-selection';
import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import { Pipeline } from '@searsuite/sear-assembly-core';
import { FakeSheetEmbeddedEditor } from '@searsuite/sear-sheet-editor-contract';
import { CancelCellEditCommand, HandleDocumentInputCommand, BeginCellEditorDragSelectionCommand, HandleCellEditorPointerCommand } from '../src/SheetCellEditorCommands';
import { FormulaInputAssistObservation } from '../src/formulaAssist/FormulaInputAssistObservation';

let container: Container;

let commandBus: SheetCommandBus;
let commitStrategies: { commitWithFormat: jest.Mock };

function commit(editor: object, core: object): Pipeline {
  const execute = createExecutePipelineSpy();
  (editor as SheetCellEditorPlugin).commitEdit(core as never);
  return execute.mock.calls[0][0];
}

let currentExecutePipeline: jest.Mock | null = null;

function createExecutePipelineSpy(implementation: (pipeline: Pipeline) => void = () => void 0): jest.Mock {
  currentExecutePipeline = jest.fn(implementation);
  return currentExecutePipeline;
}

function createEditorStub(
  value = 'abc',
  inputValidation?: unknown,
  observeCommands?: (commands: SheetCommandBus) => void,
  textShaper?: unknown,
) {
  container.registerInstance(DocNodeRegistry.symbol, new DocNodeRegistry() as never);
  const commands = new SheetCommandBus();
  commands.register(EnsureSelectionVisibleCommand,
    () => new LocalActionCommand(EnsureSelectionVisibleCommand.id, () => void 0));
  observeCommands?.(commands);
  const editor = createConstructedEditorStub(commands, inputValidation, textShaper) as unknown as {
    pluginKey: unknown;
    lastEditorRect: { x: number; y: number; width: number; height: number } | null;
    selectionPlugin: { pluginKey: unknown };
    commitStrategies: { commitWithFormat: jest.Mock };
    performCleanup: jest.Mock;
    executeEditorInput: (input: { kind: 'text' | 'delete'; text?: string }) => void;
    buildCommitPipeline: (core: unknown) => unknown;
    buildSelectionUpdate: (
      core: unknown,
      event: unknown,
    ) => { anchor: [number, number]; focus: [number, number] } | null;
    commands: SheetCommandBus;
    registerCommands(commands: SheetCommandBus): void;
  };
  commands.bind({
    executePipeline: (pipeline) => {
      if (currentExecutePipeline) {
        currentExecutePipeline(pipeline);
        return;
      }
      pipeline.steps.forEach((step) => step.prepare?.());
      pipeline.steps.forEach((step) => step.localAction?.());
      pipeline.steps.forEach((step) => step.postCommit?.());
    },
    applyEffect: () => void 0,
  });

  editor.registerCommands(commands);
  const core = {
    getDataEngine: () => createSheetDataEngine({ sheetData: { getItem: () => ({ type: 'string', value }) } }),
    configEngine: { getDefaultConfig: () => ({}) },
    renderEngine: { renderContext: {}, markDirty: jest.fn() },
    requestRender: jest.fn(),
  };
  (editor as unknown as SheetCellEditorPlugin).bindCore(core as never);
  (editor as unknown as SheetCellEditorPlugin).onDblClick(
    core as never,
    {
      target: { properties: { startRowIndex: 0, startColIndex: 0 } },
    } as never,
  );
  return editor;
}

function createConstructedEditorStub(
  commands?: SheetCommandBus,
  inputValidation?: unknown,
  textShaper?: unknown,
): SheetCellEditorPlugin {
  if (commands) commandBus = commands;
  commitStrategies = { commitWithFormat: jest.fn(() => ({ cell: { type: 'text', value: 'abc' }, format: null })) };
  return new SheetCellEditorPlugin(
    { isMergedCell: jest.fn(() => null) } as never,
    {
      onFillHandleDoubleClick: () => false,
      getState: () => [
        new Rect([
          [-1, -1],
          [-1, -1],
        ]),
      ],
    } as never,
    { subscribe: jest.fn(), startListener: jest.fn(), stopListener: jest.fn(), refocus: jest.fn() } as never,
    { subscribe: jest.fn(), startListener: jest.fn(), stopListener: jest.fn() } as never,
    { start: jest.fn(() => jest.fn()) } as never,
    { register: jest.fn(), resolve: jest.fn(() => 'default') } as never,
    { override: jest.fn() } as never,
    { setInterval: jest.fn(), clearInterval: jest.fn() } as never,
    commitStrategies as never,
    { clear: jest.fn() } as never,
    {} as never,
    { register: jest.fn(), get: jest.fn() } as never,
    new FakeSheetEmbeddedEditor(),
    commands,
    void 0,
    textShaper as never,
    void 0,
    void 0,
    void 0,
    inputValidation as never,
  );
}

function createSheetViewDataTypeReader(sheetState: { sheetData?: unknown; rowSizes?: unknown; columnSizes?: unknown }) {
  const view = {
    sheetData: sheetState.sheetData ?? { getItem: () => null },
    cellAlignments: {},
    rowSizes: sheetState.rowSizes ?? { shape: [1, 1], getDimensionLeftBoundaryByIndex: () => 0, getDimensionRightBoundaryByIndex: () => 24 },
    columnSizes: sheetState.columnSizes ?? { shape: [1, 1], getDimensionLeftBoundaryByIndex: () => 0, getDimensionRightBoundaryByIndex: () => 24 },
    rowHiddenOriginalSizes: {},
    columnHiddenOriginalSizes: {},
  };
  return (key: unknown): unknown => {
    if (key === SheetDataPlugin.pluginKey) return { sheetData: view.sheetData };
    if (key === SheetAlignmentPlugin.pluginKey) return { cellAlignments: {} };
    return void 0;
  };
}

function createSheetDataEngine(sheetState: { sheetData?: unknown; rowSizes?: unknown; columnSizes?: unknown }) {
  const getDataType = createSheetViewDataTypeReader(sheetState);
  const view = {
    sheetData: sheetState.sheetData ?? { getItem: () => null },
    cellAlignments: {},
    rowSizes: sheetState.rowSizes ?? { shape: [1, 1], getDimensionLeftBoundaryByIndex: () => 0, getDimensionRightBoundaryByIndex: () => 24 },
    columnSizes: sheetState.columnSizes ?? { shape: [1, 1], getDimensionLeftBoundaryByIndex: () => 0, getDimensionRightBoundaryByIndex: () => 24 },
    rowHiddenOriginalSizes: {},
    columnHiddenOriginalSizes: {},
  };
  return {
    getDataType,
    readDataViewField: (viewKey: string, fieldKey: string) => {
      if (viewKey !== SheetDataFieldNamespace) return null;
      if (fieldKey === SheetDataMatrixFieldKey) return view.sheetData;
      if (fieldKey === SheetHorizontalAlignmentFieldKey) return view.cellAlignments;
      if (fieldKey === SheetRowSizesFieldKey) return view.rowSizes;
      if (fieldKey === SheetColumnSizesFieldKey) return view.columnSizes;
      if (fieldKey === SheetRowHiddenOriginalSizesFieldKey) return view.rowHiddenOriginalSizes;
      if (fieldKey === SheetColumnHiddenOriginalSizesFieldKey) return view.columnHiddenOriginalSizes;
      return null;
    },
  };
}

describe('SheetCellEditorPlugin private branch coverage', () => {
  beforeEach(() => {
    container = new Container();
  });

  afterEach(() => {
    currentExecutePipeline = null;
    container.reset();
  });

  it('returns a detached document selection from the cell editor', () => {
    const editor = createEditorStub() as unknown as SheetCellEditorPlugin;
    const selection = editor.getDocumentSelection();
    selection.anchor.path[0] = 7;
    selection.head.offset = 9;

    expect(editor.getDocumentSelection()).toEqual({
      anchor: { path: [0, 0], offset: 3 },
      head: { path: [0, 0], offset: 3 },
    });
  });

  it('does not expose formula assistance mutation through a retained plugin reference', () => {
    const editor = createEditorStub() as Record<string, unknown>;

    expect(editor['formulaAnalysis']).toBeUndefined();
    expect(editor['publishFormulaAssist']).toBeUndefined();
    expect(editor['refreshFormulaAssist']).toBeUndefined();
    expect(editor['moveFormulaSuggestion']).toBeUndefined();
    expect(editor['embeddedContext']).toBeUndefined();
    expect(editor['formulaAutoClose']).toBeUndefined();
    expect(editor['disposeEditKeyboardHandlers']).toBeUndefined();
  });

  it('rejects direct edit cleanup after plugin state is owned by a Sheet runtime', () => {
    const editor = createConstructedEditorStub();
    editor.enforceStateWriteBoundary({});

    expect(Reflect.has(editor, 'performCleanup')).toBe(false);
    expect(() => editor.setState(editor.getState())).toThrow();
  });

  it('publishes rejected commit diagnostics inside a Sheet command', () => {
    const events: string[] = [];
    const editor = createEditorStub(
      'abc',
      {
        validate: () => ({ reject: true, message: 'Blocked value' }),
      },
      (commands) => {
        commands.subscribe((event) => events.push(`${event.phase}:${event.id}`));
      },
    ) as unknown as SheetCellEditorPlugin;
    const observations = new ObservationRegistry();
    editor.registerObservations(observations);
    const state = editor.getState();
    editor.setState([new Rect([[0, 0], [0, 0]]), state[1], state[2]]);

    expect(editor.commitEdit({} as never)).toBe(false);
    expect(observations.getSnapshot(FormulaInputAssistObservation).diagnostic?.message).toBe('Blocked value');
    expect(observations.getSnapshot(FormulaInputAssistObservation).diagnostic?.cellAddress).toBe('A1');
    expect(events).toContain('completed:cell.commitEdit');
  });

  it('rejects a cell draft with more than 253 line breaks', () => {
    const editor = createEditorStub(Array(255).fill('x').join('\n')) as unknown as SheetCellEditorPlugin;
    const observations = new ObservationRegistry();
    editor.registerObservations(observations);
    const state = editor.getState();
    editor.setState([new Rect([[0, 0], [0, 0]]), state[1], state[2]]);

    expect(editor.commitEdit({} as never)).toBe(false);
    expect(observations.getSnapshot(FormulaInputAssistObservation).diagnostic?.message)
      .toBe('A cell can contain at most 253 line breaks.');
  });

  it('rejects a cell draft longer than 32767 characters', () => {
    const editor = createEditorStub('X' + 'A'.repeat(32767)) as unknown as SheetCellEditorPlugin;
    const observations = new ObservationRegistry();
    editor.registerObservations(observations);
    const state = editor.getState();
    editor.setState([new Rect([[0, 0], [0, 0]]), state[1], state[2]]);

    expect(editor.commitEdit({} as never)).toBe(false);
    expect(observations.getSnapshot(FormulaInputAssistObservation).diagnostic?.message)
      .toBe('A cell can contain at most 32767 characters.');
  });

  it('does not lend command write authority to formula assist observers', () => {
    let commands: SheetCommandBus | undefined;
    const editor = createEditorStub(
      'abc',
      {
        validate: () => ({ reject: true, message: 'Blocked value' }),
      },
      (bus) => {
        commands = bus;
      },
    ) as unknown as SheetCellEditorPlugin;
    const observations = new ObservationRegistry();
    editor.registerObservations(observations);
    const authority: boolean[] = [];
    observations.subscribe(FormulaInputAssistObservation, () => authority.push(commands!.isExecuting()));

    expect(editor.commitEdit({} as never)).toBe(false);
    expect(authority.length).toBeGreaterThan(1);
    expect(authority.every((value) => value === false)).toBe(true);
  });

  it('buildCommitPipeline computes plain text and appends commit operation', () => {
    const editor = createEditorStub();
    commandBus.run(HandleDocumentInputCommand, { kind: 'text', text: 'X' });
    const editorState = [
      new Rect([
        [1, 2],
        [1, 2],
      ]),
      new Rect([
        [1, 2],
        [1, 2],
      ]),
      new Rect([
        [0, 0],
        [0, 0],
      ]),
    ];
    const core = {
      getDataEngine: () => ({
        readDataViewField: createSheetDataEngine({ sheetData: { getItem: () => ({ value: 'old' }) } })
          .readDataViewField,
        getDataType: (key: unknown) => {
          if (key === editor.pluginKey) return editorState;
          return createSheetViewDataTypeReader({ sheetData: { getItem: () => ({ value: 'old' }) } })(key);
        },
      }),
    };

    const pipeline = commit(editor, core);

    expect(commitStrategies.commitWithFormat).toHaveBeenCalledWith(
      expect.objectContaining({ row: 1, col: 2, plainText: 'abcX' }),
    );
    expect(pipeline.steps.some((step) => step.name === 'cell-editor.exit-edit-mode')).toBe(true);
  });

  it('buildCommitPipeline skips value inference when a reopened cell is unchanged', () => {
    const editor = createEditorStub('001');
    const editorState = [
      new Rect([[0, 0], [0, 0]]),
      new Rect([[0, 0], [0, 0]]),
      new Rect([[0, 0], [0, 0]]),
    ];
    const dataEngine = createSheetDataEngine({ sheetData: { getItem: () => ({ type: 'string', value: '001' }) } });
    const core = {
      getDataEngine: () => ({
        ...dataEngine,
        getDataType: (key: unknown) => (key === editor.pluginKey ? editorState : dataEngine.getDataType(key)),
      }),
    };

    const pipeline = commit(editor, core as never) as Pipeline;

    expect(commitStrategies.commitWithFormat).not.toHaveBeenCalled();
    expect(pipeline.steps.some((step) => step.name === 'cell-editor.commit-value')).toBe(false);
    expect(pipeline.steps.some((step) => step.name === 'cell-editor.exit-edit-mode')).toBe(true);
  });

  it('BUG-959 commits a multiline value and the needed row growth in one pipeline', () => {
    const editor = createEditorStub('one\ntwo\nthree', undefined, undefined, {
      shape: () => ({ width: 20, height: 12 }),
    });
    commandBus.run(HandleDocumentInputCommand, { kind: 'text', text: 'X' });
    const editorState = [
      new Rect([
        [19, 1],
        [19, 1],
      ]),
      new Rect([
        [19, 1],
        [19, 1],
      ]),
      new Rect([
        [0, 0],
        [0, 0],
      ]),
    ];
    const sheetData = { getItem: () => ({ type: 'string', value: '' }) };
    const dataEngine = createSheetDataEngine({ sheetData, rowSizes: { getItem: () => 24 } });
    const core = {
      getDataEngine: () => ({
        ...dataEngine,
        getDataType: (key: unknown) => (key === editor.pluginKey ? editorState : dataEngine.getDataType(key)),
      }),
      configEngine: { getDefaultConfig: () => ({ sheetCellFontSize: 10 }) },
    };
    const pipeline = commit(editor, core as never) as Pipeline;
    const valueStep = pipeline.steps.find((step) => step.name === 'cell-editor.commit-value');
    const resizeStep = pipeline.steps.find((step) => step.name === 'expand-multiline-rows');
    expect(valueStep?.transaction?.operations).toHaveLength(1);
    expect(resizeStep?.transaction?.operations).toEqual([
      expect.objectContaining({ p: [19], rr: { value: 52, prev: 24 } }),
    ]);
  });

  it('buildCommitPipeline uses empty plain text for semantically empty docs', () => {
    const editor = createEditorStub('x');
    commandBus.run(HandleDocumentInputCommand, { kind: 'delete' });
    const editorState = [
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
    ];
    const core = {
      getDataEngine: () => ({
        readDataViewField: createSheetDataEngine({ sheetData: { getItem: () => null } }).readDataViewField,
        getDataType: (key: unknown) => {
          if (key === editor.pluginKey) return editorState;
          return createSheetViewDataTypeReader({ sheetData: { getItem: () => null } })(key);
        },
      }),
    };

    commit(editor, core);

    expect(commitStrategies.commitWithFormat).toHaveBeenCalledWith(expect.objectContaining({ plainText: '' }));
  });

  it('buildCommitPipeline skips commit step when editor state is missing', () => {
    const editor = createEditorStub();
    const core = {
      getDataEngine: () => ({
        getDataType: () => void 0,
      }),
    };

    const pipeline = commit(editor, core);

    expect(commitStrategies.commitWithFormat).not.toHaveBeenCalled();
    expect(pipeline.steps.some((step) => step.name === 'cell-editor.exit-edit-mode')).toBe(true);
  });

  it('buildSelectionUpdate maps row/column headers and handles missing data safely', () => {
    const state = {
      rowSizes: { shape: [1, 8] },
      columnSizes: { shape: [1, 10] },
    };
    const core = {
      getDataEngine: () => ({
        ...createSheetDataEngine(state),
      }),
    };

    const row = buildSelectionUpdate(
      core as never,
      {
        target: {
          properties: { region: CellRegion.RowHeader, startRowIndex: 2, startColIndex: 0, endRowIndex: 3 },
        },
      } as never,
    );
    expect(row?.anchor).toEqual([2, 0]);
    expect(row?.focus).toEqual([3, 9]);

    const col = buildSelectionUpdate(
      core as never,
      {
        target: {
          properties: { region: CellRegion.ColumnHeader, startRowIndex: 0, startColIndex: 1, endColIndex: 2 },
        },
      } as never,
    );
    expect(col?.anchor).toEqual([0, 1]);
    expect(col?.focus).toEqual([7, 2]);

    const normal = buildSelectionUpdate(
      core as never,
      { target: { properties: { startRowIndex: 4, startColIndex: 5 } } } as never,
    );
    expect(normal?.anchor).toEqual([4, 5]);
    expect(normal?.focus).toEqual([4, 5]);

    const noTarget = buildSelectionUpdate(core as never, {} as never);
    expect(noTarget).toBeNull();

    const missingCell = buildSelectionUpdate(
      core as never,
      { target: { properties: { startRowIndex: void 0, startColIndex: 1 } } } as never,
    );
    expect(missingCell).toBeNull();

    const noState = buildSelectionUpdate(
      { getDataEngine: () => ({ getDataType: () => void 0 }) } as never,
      { target: { properties: { region: CellRegion.RowHeader, startRowIndex: 1 } } } as never,
    );
    expect(noState).toBeNull();

    const noColumnState = buildSelectionUpdate(
      { getDataEngine: () => ({ getDataType: () => void 0 }) } as never,
      { target: { properties: { region: CellRegion.ColumnHeader, startRowIndex: 0, startColIndex: 1 } } } as never,
    );
    expect(noColumnState).toBeNull();
  });

  it('returns false when drag-select move has no editor rect', () => {
    const editor = createEditorStub() as unknown as {
      pointerCapture: { start: jest.Mock };
      lastEditorRect: { x: number; y: number; width: number; height: number } | null;
      onMouseMove(core: unknown, event: unknown): boolean | void;
      getCommandBus(): SheetCommandBus;
    };

    editor.pointerCapture = { start: jest.fn(() => jest.fn()) };
    commandBus.run(BeginCellEditorDragSelectionCommand, void 0);
    expect(editor.onMouseMove({} as never, { origin: { offsetX: 0, offsetY: 0 } } as never)).toBe(false);
  });

  it('handleEditorPointer is a no-op when no edit session exists', () => {
    const commands = new SheetCommandBus();
    const editor = createConstructedEditorStub(commands);
    commands.bind({ executePipeline: jest.fn(), applyEffect: jest.fn() });
    editor.registerCommands(commands);
    expect((editor as unknown as Record<string, unknown>)['handleEditorPointer']).toBeUndefined();
    commands.run(HandleCellEditorPointerCommand, { type: 'pointerDown', point: { x: 5, y: 6 } });
    expect(editor.getDocumentSelection().anchor.offset).toBe(0);
  });

  it('does not allow formula services to be replaced after binding', () => {
    const editor = createConstructedEditorStub();
    const registry = {} as Parameters<typeof editor.bindFormulaRegistry>[0];
    const picker = {} as Parameters<typeof editor.bindReferencePickService>[0];
    editor.bindFormulaRegistry(registry);
    editor.bindReferencePickService(picker);

    Object.assign(editor, { functionRegistry: {}, referencePickService: {} });
    expect(() => editor.bindFormulaRegistry(registry)).not.toThrow();
    expect(() => editor.bindReferencePickService(picker)).not.toThrow();
    expect(() => editor.bindFormulaRegistry({} as typeof registry)).toThrow('already bound');
    expect(() => editor.bindReferencePickService({} as typeof picker)).toThrow('already bound');
  });

  it('closes optional reference picker binding when commands are registered', () => {
    const editor = createConstructedEditorStub();
    editor.registerCommands(new SheetCommandBus());

    expect(() => editor.bindReferencePickService({} as never)).toThrow('after command registration');
  });

  it('stages cancellation before the session is disposed', () => {
    createEditorStub();
    const execute = createExecutePipelineSpy();
    commandBus.run(CancelCellEditCommand, { restoreOriginalDocument: true });
    const pipeline: Pipeline = execute.mock.calls[0][0];
    expect(pipeline.steps.some((step) => step.name === 'cell-editor.exit-edit-mode')).toBe(true);
    expect(pipeline.dirtyRects).toEqual([]);
  });

  it('skips reference highlights when the sheet has no rows or columns', () => {
    expect(
      resolveReferenceHighlightBounds(
        { kind: CellRangeHighlightKind.ColumnRange, startCol: 0, endCol: 1 } as never,
        { rowCount: 0, colCount: 5 },
      ),
    ).toBeNull();

    expect(
      resolveReferenceHighlightBounds(
        { kind: CellRangeHighlightKind.RowRange, startRow: 0, endRow: 1 } as never,
        { rowCount: 5, colCount: 0 },
      ),
    ).toBeNull();
  });
});
