import { Rect } from '@searsuite/sear-foundation-rect';
import { Container, Injectable } from '@searsuite/sear-foundation-di';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { SearCoreDoc, DocCompositionManager, DocCursorManager, DocInputPlugin } from '@searsuite/sear-assembly-core';
import { RenderContext } from '@searsuite/sear-render-context';
import { TextShaper } from '@searsuite/sear-render-metrics';
import { SheetDataPlugin, SheetDataFieldNamespace, SheetDataMatrixFieldKey } from '@searsuite/sear-render-engine';
import { SheetAlignmentPlugin, SheetHorizontalAlignmentFieldKey } from '@searsuite/sear-plugin-alignment';
import {
  SheetColumnHiddenOriginalSizesFieldKey,
  SheetColumnSizesFieldKey,
  SheetRowHiddenOriginalSizesFieldKey,
  SheetRowSizesFieldKey,
} from '@searsuite/sear-plugin-resize';
import { DocNodeRegistry, RichTextBlockFlowRegistry, stringToRichDoc } from '@searsuite/sear-domain-doc';
import { DocLayoutEngine } from '@searsuite/sear-domain-editor';
import { Tree } from '@searsuite/sear-render-node';
import { SheetHorizontalAlignment } from '@searsuite/sear-plugin-alignment';
import { CellRangeHighlightKind } from '../src/Highlighter';
import { SheetCellEditorPlugin as RuntimeSheetCellEditorPlugin } from '../src/SheetCellEditor';
import * as renderModule from '@searsuite/sear-render';
import { FakeSheetEmbeddedEditor } from '@searsuite/sear-sheet-editor-contract';
import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { CancelCellEditCommand, OpenCellEditorCommand } from '../src/SheetCellEditorCommands';
import { type SheetEditSession } from '@searsuite/sear-sheet-editor-contract';

let container: Container;

@Injectable()
class FakeTree {
  getBoundary() {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  updateBoundary() {}

  insert() {}
}

class FakeConfigEngine {
  getDefaultConfig() {
    return {};
  }
}

function createDocState(width: number = 60, height: number = 24) {
  return {
    registerPlugin: jest.fn(),
    prepareEditorRenderLayout: jest.fn(
      (input: { origin: { x: number; y: number }; minWidth: number; minHeight: number }) => ({
        positionRect: {
          x: input.origin.x,
          y: input.origin.y,
          width: Math.max(input.minWidth, width),
          height: Math.max(input.minHeight, height),
        },
        snapshot: {
          lines: [
            {
              textNodePath: [0, 0],
              charStartOffset: 0,
              chars: [{ char: 'a', width: 8 }],
              x: 4,
              y: 14,
              height: 12,
            },
          ],
        },
        cursorRelative: { x: 8, y: 6, height: 14 },
        composingCaretPixelOffset: 2,
        contentWidth: Math.max(0, Math.max(input.minWidth, width)),
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

function createDocInputPlugin(): DocInputPlugin {
  return new DocInputPlugin(new DocLayoutEngine(new RichTextBlockFlowRegistry()));
}

function createEmbeddedEditor(): FakeSheetEmbeddedEditor {
  return new FakeSheetEmbeddedEditor();
}

function createCursorManager() {
  return {
    getCursor: jest.fn(() => null),
    getSelectionRects: jest.fn(() => []),
    setCursor: jest.fn(),
    setSelectionRects: jest.fn(),
    clearCursor: jest.fn(),
  };
}

class SheetCellEditorPlugin extends RuntimeSheetCellEditorPlugin {
  readonly adapter: FakeSheetEmbeddedEditor;
  constructor(...args: ConstructorParameters<typeof RuntimeSheetCellEditorPlugin>) {
    Object.assign(args[1], { getState: () => [new Rect([[-1, -1], [-1, -1]])] });
    Object.assign(args[2], { startListener: jest.fn(), stopListener: jest.fn() });
    Object.assign(args[3], { startListener: jest.fn(), stopListener: jest.fn() });
    super(...args);
    this.adapter = args[12] as FakeSheetEmbeddedEditor;
    this.bindRuntimeServices(container);
  }
}

function createSheetDataEngine(
  pluginKey: unknown,
  pluginState: unknown,
  sheetState: {
    sheetData: unknown;
    rowSizes: unknown;
    columnSizes: unknown;
    cellAlignments: unknown;
  },
) {
  const view = {
    sheetData: sheetState.sheetData,
    rowSizes: sheetState.rowSizes,
    columnSizes: sheetState.columnSizes,
    cellAlignments: sheetState.cellAlignments,
    rowHiddenOriginalSizes: {},
    columnHiddenOriginalSizes: {},
  };
  return {
    getDataType: (key: unknown) => {
      if (key === pluginKey) return pluginState;
      if (key === SheetDataPlugin.pluginKey) return { sheetData: view.sheetData };
      if (key === SheetAlignmentPlugin.pluginKey) return { cellAlignments: view.cellAlignments };
      return void 0;
    },
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

function prepareRenderDocument(
  plugin: RuntimeSheetCellEditorPlugin,
  core: { getDataEngine(): { readDataViewField(viewKey: string, fieldKey: string): unknown } },
  text: string,
  active = false,
  configureSession?: (session: SheetEditSession) => void,
): { reopen(text: string): void } {
  const adapter = (plugin as SheetCellEditorPlugin).adapter;
  if (configureSession) {
    const createSession = adapter.createEditSession.bind(adapter);
    jest.spyOn(adapter, 'createEditSession').mockImplementation((context) => {
      const session = createSession(context);
      configureSession(session);
      return session;
    });
  }
  const readDataEngine = core.getDataEngine.bind(core);
  const commands = new SheetCommandBus();
  plugin.registerCommands(commands);
  plugin.bindCore(core as never);
  commands.bind({
    executePipeline: (pipeline) => {
      pipeline.steps.forEach((step) => step.prepare?.());
      pipeline.steps.forEach((step) => step.localAction?.());
      pipeline.steps.forEach((step) => step.postCommit?.());
    },
    applyEffect: () => void 0,
  });
  const open = (value: string) => {
    core.getDataEngine = () => {
      const engine = readDataEngine();
      return {
        ...engine,
        readDataViewField: (viewKey: string, fieldKey: string) => fieldKey === SheetDataMatrixFieldKey
          ? { getItem: () => ({ type: 'string', value }) }
          : engine.readDataViewField(viewKey, fieldKey),
      };
    };
    try {
      commands.run(OpenCellEditorCommand, { row: 0, column: 0 });
    } finally {
      core.getDataEngine = readDataEngine;
    }
  };
  open(text);
  if (!active) commands.run(CancelCellEditCommand, { restoreOriginalDocument: false });
  return {
    reopen(value: string) {
      if (active) commands.run(CancelCellEditCommand, { restoreOriginalDocument: false });
      open(value);
    },
  };
}

describe('SheetCellEditorPlugin render coverage', () => {
  beforeEach(() => {
    container = new Container();
    container.registerInstance(Tree.symbol, new FakeTree() as never);
    container.registerInstance(ConfigEngine.symbol, new FakeConfigEngine() as never);
    container.registerInstance(DocCompositionManager.symbol, createCompositionManager() as never);
    container.registerInstance(TextShaper.symbol, {
      shape: jest.fn((input: { text: string }) => ({
        glyphs: [],
        clusters: [],
        caretStops: [
          { textOffset: 0, x: 0 },
          { textOffset: input.text.length, x: input.text.length * 10 },
        ],
        width: input.text.length * 10,
        height: 12,
        fontAscent: 9,
        fontDescent: 3,
      })),
    } as never);
  });

  afterEach(() => {
    container.reset();
    jest.restoreAllMocks();
  });

  it('renders editor and reference overlay nodes with composing text expansion', () => {
    jest.spyOn(renderModule, 'getSheetRangePositionRect').mockImplementation(
      () =>
        ({
          x: 10,
          y: 20,
          width: 60,
          height: 24,
        } as never),
    );

    const docState = createDocState(50);
    const cursorManager = createCursorManager();
    container.registerInstance(SearCoreDoc.symbol, docState as never);
    container.registerInstance(DocCursorManager.symbol, cursorManager as never);
    container.registerInstance(DocNodeRegistry.symbol, new DocNodeRegistry() as never);
    container.registerInstance(RenderContext.symbol, {} as never);

    const plugin = new SheetCellEditorPlugin(
      { isMergedCell: jest.fn(() => null) } as never,
      { pluginKey: 'SelectionPlugin', navigateDown: jest.fn(), restartNavigation: jest.fn() } as never,
      {
        subscribe: jest.fn(),
        setPosition: jest.fn(),
      } as never,
      {
        subscribe: jest.fn(),
      } as never,
      { start: jest.fn(() => jest.fn()), stop: jest.fn() } as never,
      { register: jest.fn() } as never,
      { override: jest.fn() } as never,
      { setInterval: jest.fn(() => 1), clearInterval: jest.fn() } as never,
      { commit: jest.fn(() => 'v') } as never,
      {
        clear: jest.fn(),
        highlight: jest.fn(() => ({
          textAttributes: [],
          cellRanges: [
            {
              kind: CellRangeHighlightKind.ColumnRange,
              startCol: 0,
              endCol: 1,
              color: '#ff0000',
              fill: 'rgba(255,0,0,0.15)',
            },
            {
              kind: CellRangeHighlightKind.RowRange,
              startRow: 0,
              endRow: 1,
              color: '#00ff00',
              fill: 'rgba(0,255,0,0.15)',
            },
            {
              kind: CellRangeHighlightKind.CellRange,
              start: [0, 0],
              end: [0, 0],
              color: '#0000ff',
              fill: 'rgba(0,0,255,0.15)',
            },
          ],
        })),
      } as never,
      { viewToWorld: jest.fn() } as never,
      { get: jest.fn(() => void 0), register: jest.fn() } as never,
      createEmbeddedEditor(),
    ) as unknown as {
      pluginKey: unknown;
      getState(): [Rect, Rect, Rect];
      session: {
        pendingDoc: ReturnType<typeof stringToRichDoc>;
        docSelection: {
          anchor: { path: [number, number]; offset: number };
          head: { path: [number, number]; offset: number };
        };
      };
      render(core: unknown): unknown[];
    };

    const state = plugin.getState();
    state[1] = new Rect([
      [0, 0],
      [0, 0],
    ]);

    const createdNodes = [{ properties: {} }, { properties: {} }];
    const core = {
      configEngine: {
        getDefaultConfig: () => ({
          sheetOffsetX: 0,
          sheetOffsetY: 0,
          cellPadding: 4,
          defaultCellAlign: SheetHorizontalAlignment.Right,
        }),
      },
      getDataEngine: () =>
        createSheetDataEngine(plugin.pluginKey, state, {
          sheetData: { getItem: () => ({ value: 'very-long-text' }) },
          rowSizes: { shape: [1, 20] },
          columnSizes: { shape: [1, 20] },
          cellAlignments: { getItem: () => SheetHorizontalAlignment.Right },
        }),
      renderEngine: {
        renderContext: { measureText: () => ({ width: 90 }) },
        scrollManager: { getState: () => ({ x: 0, y: 0 }), getShape: () => [200, 120] },
        markDirty: jest.fn(),
        renderCoordinatorManager: {
          create: jest.fn(() => ({
            render: () => createdNodes.map((node) => ({ ...node })),
          })),
        },
      },
    };

    prepareRenderDocument(plugin as unknown as RuntimeSheetCellEditorPlugin, core, 'A1:B2');
    const nodes = plugin.render(core as never);
    expect(nodes.length).toBeGreaterThan(0);
    expect(core.renderEngine.markDirty).toHaveBeenCalled();
    expect(core.renderEngine.renderCoordinatorManager.create).toHaveBeenCalledWith(
      { type: expect.any(Symbol) },
      expect.objectContaining({ x: 10, y: 20 }),
      expect.objectContaining({ fill: '#ffffff', stroke: 'rgba(56, 110, 246, 1)' }),
    );
    expect(docState.prepareEditorRenderLayout).not.toHaveBeenCalled();
    expect(nodes[nodes.length - 1]).toEqual(
      expect.objectContaining({ properties: expect.objectContaining({ isEdit: true }) }),
    );
  });

  it('draws cell-editor document overlay from cursor manager state', () => {
    jest
      .spyOn(renderModule, 'getSheetRangePositionRect')
      .mockReturnValue({ x: 10, y: 20, width: 60, height: 24 } as never);

    const docState = createDocState(50);
    const cursorManager = {
      getCursor: jest.fn(() => ({ x: 18, y: 30, height: 12, visible: true })),
      getSelectionRects: jest.fn(() => [{ x: 12, y: 22, width: 10, height: 12 }]),
      setCursor: jest.fn(),
      setSelectionRects: jest.fn(),
      clearCursor: jest.fn(),
    };
    container.registerInstance(SearCoreDoc.symbol, docState as never);
    container.registerInstance(DocCursorManager.symbol, cursorManager as never);
    container.registerInstance(DocNodeRegistry.symbol, new DocNodeRegistry() as never);
    container.registerInstance(RenderContext.symbol, {} as never);

    const plugin = new SheetCellEditorPlugin(
      { isMergedCell: jest.fn(() => null) } as never,
      { pluginKey: 'SelectionPlugin', navigateDown: jest.fn(), restartNavigation: jest.fn() } as never,
      { subscribe: jest.fn(), setPosition: jest.fn() } as never,
      { subscribe: jest.fn() } as never,
      { start: jest.fn(() => jest.fn()), stop: jest.fn() } as never,
      { register: jest.fn() } as never,
      { override: jest.fn() } as never,
      { setInterval: jest.fn(() => 1), clearInterval: jest.fn() } as never,
      { commit: jest.fn(() => 'v') } as never,
      { clear: jest.fn(), highlight: jest.fn(() => ({ textAttributes: [], cellRanges: [] })) } as never,
      { viewToWorld: jest.fn() } as never,
      { get: jest.fn(() => void 0), register: jest.fn() } as never,
      createEmbeddedEditor(),
    ) as unknown as {
      pluginKey: unknown;
      getState(): [Rect, Rect, Rect];
      session: {
        pendingDoc: ReturnType<typeof stringToRichDoc>;
        docSelection: {
          anchor: { path: [number, number]; offset: number };
          head: { path: [number, number]; offset: number };
        };
      };
      editSession: { render: jest.Mock; getCursor: jest.Mock };
      render(core: unknown): Array<{ drawScene(context: unknown): void }>;
    };

    const state = plugin.getState();
    state[1] = new Rect([
      [0, 0],
      [0, 0],
    ]);

    const core = {
      configEngine: {
        getDefaultConfig: () => ({
          sheetOffsetX: 0,
          sheetOffsetY: 0,
          cellPadding: 4,
          defaultCellAlign: SheetHorizontalAlignment.Left,
        }),
      },
      getDataEngine: () =>
        createSheetDataEngine(plugin.pluginKey, state, {
          sheetData: { getItem: () => ({ value: 'abc' }) },
          rowSizes: { shape: [1, 2] },
          columnSizes: { shape: [1, 2] },
          cellAlignments: { getItem: () => SheetHorizontalAlignment.Left },
        }),
      renderEngine: {
        renderContext: { measureText: () => ({ width: 20 }) },
        scrollManager: { getState: () => ({ x: 2, y: 3 }), getShape: () => [200, 120] },
        markDirty: jest.fn(),
        renderCoordinatorManager: {
          create: jest.fn(() => ({ render: () => ({ properties: {} }) })),
        },
      },
    };

    prepareRenderDocument(plugin as unknown as RuntimeSheetCellEditorPlugin, core, 'abc', true, (session) => {
      jest.spyOn(session, 'getCursor').mockReturnValue(null);
      jest.spyOn(session, 'render').mockImplementation((context) => {
        context!.rect(12, 22, 10, 12);
        context!.fillText('a', 14, 34);
        context!.moveTo(16, 18);
        context!.lineTo(16, 30);
        context!.stroke();
        return { needsRedraw: false };
      });
    });
    const nodes = plugin.render(core as never);
    const docNodes = nodes.filter((node) => {
      const properties = (node as { readonly properties?: { readonly depth?: number } }).properties;
      return properties?.depth === 6;
    });
    const context = {
      save: jest.fn(),
      restore: jest.fn(),
      setFillStyle: jest.fn(),
      beginPath: jest.fn(),
      rect: jest.fn(),
      fill: jest.fn(),
      fillText: jest.fn(),
      clip: jest.fn(),
      measureText: jest.fn(() => ({ fontAscent: 9, fontDescent: 3, width: 4 })),
      setTransform: jest.fn(),
      setStrokeStyle: jest.fn(),
      setLineWidth: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
    };

    docNodes.forEach((node) => node.drawScene(context));

    expect(context.rect).toHaveBeenCalledWith(12, 22, 10, 12);
    expect(context.fillText).toHaveBeenCalledWith('a', 14, 34);
    expect(context.moveTo).toHaveBeenCalledWith(16, 18);
    expect(context.lineTo).toHaveBeenCalledWith(16, 30);
    expect(context.stroke).toHaveBeenCalled();
  });

  it('returns empty nodes when editor state is missing or sheet range cannot be resolved', () => {
    container.registerInstance(DocNodeRegistry.symbol, new DocNodeRegistry() as never);

    const plugin = Object.create(SheetCellEditorPlugin.prototype) as {
      pluginKey: unknown;
      render(core: unknown, offset?: { x: number; y: number }): unknown[];
      docInputPlugin: {
        session: {
          pendingDoc: ReturnType<typeof stringToRichDoc>;
          docSelection: { head: { path: [number, number]; offset: number } };
        };
      };
      highlighter: { highlight: jest.Mock };
      originalContentWidth: number;
    };
    plugin.pluginKey = 'EditorPlugin';
    plugin.docInputPlugin = {
      session: { pendingDoc: stringToRichDoc('x'), docSelection: { head: { path: [0, 0], offset: 0 } } },
    };
    plugin.highlighter = { highlight: jest.fn(() => ({ textAttributes: [], cellRanges: [] })) } as never;
    plugin.originalContentWidth = 0;

    const missingEditorStateCore = {
      getDataEngine: () => ({ getDataType: () => void 0 }),
      configEngine: { getDefaultConfig: () => ({ sheetOffsetX: 0, sheetOffsetY: 0 }) },
    };
    expect(plugin.render(missingEditorStateCore as never)).toEqual([]);

    const selectionState = [
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
    const defaultState = {
      rowSizes: { shape: [1, 2] },
      columnSizes: { shape: [1, 2] },
      sheetData: { getItem: () => ({ value: 'x' }) },
      cellAlignments: { getItem: () => SheetHorizontalAlignment.Left },
    };
    const core = {
      getDataEngine: () => ({
        getDataType: (key: unknown) => (key === plugin.pluginKey ? selectionState : void 0),
        readDataViewField: (viewKey: string, fieldKey: string) => {
          if (viewKey !== SheetDataFieldNamespace) return null;
          if (fieldKey === SheetDataMatrixFieldKey) return defaultState.sheetData;
          if (fieldKey === SheetHorizontalAlignmentFieldKey) return defaultState.cellAlignments;
          if (fieldKey === SheetRowSizesFieldKey) return defaultState.rowSizes;
          if (fieldKey === SheetColumnSizesFieldKey) return defaultState.columnSizes;
          return null;
        },
      }),
      configEngine: {
        getDefaultConfig: () => ({
          sheetOffsetX: 0,
          sheetOffsetY: 0,
          cellPadding: 4,
          defaultCellAlign: SheetHorizontalAlignment.Left,
        }),
      },
      renderEngine: {
        renderContext: {},
        scrollManager: { getState: () => ({ x: 0, y: 0 }), getShape: () => [200, 120] },
      },
    };

    const rangeSpy = jest.spyOn(renderModule, 'getSheetRangePositionRect').mockReturnValueOnce(null as never);
    expect(plugin.render(core as never)).toEqual([]);
    rangeSpy.mockRestore();

    const defaultOffsetCore = {
      getDataEngine: () => ({ getDataType: () => void 0 }),
      configEngine: { getDefaultConfig: () => ({}) },
    };
    expect(plugin.render(defaultOffsetCore as never)).toEqual([]);
    expect(plugin.render(defaultOffsetCore as never, { x: 1, y: 2 })).toEqual([]);
  });

  it('skips unresolved reference ranges during overlay rendering', () => {
    jest
      .spyOn(renderModule, 'getSheetRangePositionRect')
      .mockReturnValueOnce({ x: 10, y: 20, width: 60, height: 24 } as never)
      .mockReturnValueOnce(null as never);

    const docState = createDocState(50);
    const cursorManager = createCursorManager();
    container.registerInstance(SearCoreDoc.symbol, docState as never);
    container.registerInstance(DocCursorManager.symbol, cursorManager as never);
    container.registerInstance(DocNodeRegistry.symbol, new DocNodeRegistry() as never);
    container.registerInstance(RenderContext.symbol, {} as never);

    const plugin = new SheetCellEditorPlugin(
      { isMergedCell: jest.fn(() => null) } as never,
      { pluginKey: 'SelectionPlugin', navigateDown: jest.fn(), restartNavigation: jest.fn() } as never,
      { subscribe: jest.fn(), setPosition: jest.fn() } as never,
      { subscribe: jest.fn() } as never,
      { start: jest.fn(() => jest.fn()), stop: jest.fn() } as never,
      { register: jest.fn() } as never,
      { override: jest.fn() } as never,
      { setInterval: jest.fn(() => 1), clearInterval: jest.fn() } as never,
      { commit: jest.fn(() => 'v') } as never,
      {
        clear: jest.fn(),
        highlight: jest.fn(() => ({
          textAttributes: [],
          cellRanges: [
            {
              kind: CellRangeHighlightKind.ColumnRange,
              startCol: 0,
              endCol: 1,
              color: '#f00',
              fill: 'rgba(255,0,0,.2)',
            },
          ],
        })),
      } as never,
      { viewToWorld: jest.fn() } as never,
      { get: jest.fn(() => void 0), register: jest.fn() } as never,
      createEmbeddedEditor(),
    ) as unknown as {
      pluginKey: unknown;
      getState(): [Rect, Rect, Rect];
      session: {
        pendingDoc: ReturnType<typeof stringToRichDoc>;
        docSelection: { head: { path: [number, number]; offset: number } };
      };
      render(core: unknown): unknown[];
    };

    const state = plugin.getState();
    state[1] = new Rect([
      [0, 0],
      [0, 0],
    ]);

    const core = {
      configEngine: {
        getDefaultConfig: () => ({
          sheetOffsetX: 0,
          sheetOffsetY: 0,
          cellPadding: 4,
          defaultCellAlign: SheetHorizontalAlignment.Left,
        }),
      },
      getDataEngine: () =>
        createSheetDataEngine(plugin.pluginKey, state, {
          sheetData: { getItem: () => ({ value: 'abc' }) },
          rowSizes: { shape: [1, 2] },
          columnSizes: { shape: [1, 2] },
          cellAlignments: { getItem: () => SheetHorizontalAlignment.Left },
        }),
      renderEngine: {
        renderContext: { measureText: () => ({ width: 20 }) },
        scrollManager: { getState: () => ({ x: 0, y: 0 }), getShape: () => [200, 120] },
        markDirty: jest.fn(),
        renderCoordinatorManager: {
          create: jest.fn(() => ({ render: () => ({ properties: {} }) })),
        },
      },
    };

    prepareRenderDocument(plugin as unknown as RuntimeSheetCellEditorPlugin, core, 'A:A');
    expect(plugin.render(core as never).length).toBeGreaterThan(0);
  });

  it('skips reference overlays when highlight bounds cannot be resolved from sheet shape', () => {
    jest
      .spyOn(renderModule, 'getSheetRangePositionRect')
      .mockReturnValue({ x: 10, y: 20, width: 60, height: 24 } as never);

    const docState = createDocState(50);
    const cursorManager = createCursorManager();
    container.registerInstance(SearCoreDoc.symbol, docState as never);
    container.registerInstance(DocCursorManager.symbol, cursorManager as never);
    container.registerInstance(DocNodeRegistry.symbol, new DocNodeRegistry() as never);
    container.registerInstance(RenderContext.symbol, {} as never);

    const plugin = new SheetCellEditorPlugin(
      { isMergedCell: jest.fn(() => null) } as never,
      { pluginKey: 'SelectionPlugin', navigateDown: jest.fn(), restartNavigation: jest.fn() } as never,
      { subscribe: jest.fn(), setPosition: jest.fn() } as never,
      { subscribe: jest.fn() } as never,
      { start: jest.fn(() => jest.fn()), stop: jest.fn() } as never,
      { register: jest.fn() } as never,
      { override: jest.fn() } as never,
      { setInterval: jest.fn(() => 1), clearInterval: jest.fn() } as never,
      { commit: jest.fn(() => 'v') } as never,
      {
        clear: jest.fn(),
        highlight: jest.fn(() => ({
          textAttributes: [],
          cellRanges: [
            {
              kind: CellRangeHighlightKind.ColumnRange,
              startCol: 0,
              endCol: 1,
              color: '#f00',
              fill: 'rgba(255,0,0,.2)',
            },
          ],
        })),
      } as never,
      { viewToWorld: jest.fn() } as never,
      { get: jest.fn(() => void 0), register: jest.fn() } as never,
      createEmbeddedEditor(),
    ) as unknown as {
      pluginKey: unknown;
      getState(): [Rect, Rect, Rect];
      session: {
        pendingDoc: ReturnType<typeof stringToRichDoc>;
        docSelection: { head: { path: [number, number]; offset: number } };
      };
      render(core: unknown): unknown[];
    };

    const state = plugin.getState();
    state[1] = new Rect([
      [0, 0],
      [0, 0],
    ]);

    const core = {
      configEngine: {
        getDefaultConfig: () => ({
          sheetOffsetX: 0,
          sheetOffsetY: 0,
          cellPadding: 4,
          defaultCellAlign: SheetHorizontalAlignment.Left,
        }),
      },
      getDataEngine: () =>
        createSheetDataEngine(plugin.pluginKey, state, {
          sheetData: { getItem: () => ({ value: 'abc' }) },
          rowSizes: { shape: [1, 0] },
          columnSizes: { shape: [1, 2] },
          cellAlignments: { getItem: () => SheetHorizontalAlignment.Left },
        }),
      renderEngine: {
        renderContext: { measureText: () => ({ width: 20 }) },
        scrollManager: { getState: () => ({ x: 0, y: 0 }), getShape: () => [200, 120] },
        markDirty: jest.fn(),
        renderCoordinatorManager: {
          create: jest.fn(() => ({ render: () => ({ properties: {} }) })),
        },
      },
    };

    prepareRenderDocument(plugin as unknown as RuntimeSheetCellEditorPlugin, core, 'A:A');
    expect(plugin.render(core as never).length).toBeGreaterThan(0);
  });

  it('handles missing render nodes when coordinator create returns null', () => {
    jest
      .spyOn(renderModule, 'getSheetRangePositionRect')
      .mockReturnValue({ x: 10, y: 20, width: 60, height: 24 } as never);

    const docState = createDocState(40);
    const cursorManager = createCursorManager();
    container.registerInstance(SearCoreDoc.symbol, docState as never);
    container.registerInstance(DocCursorManager.symbol, cursorManager as never);
    container.registerInstance(DocNodeRegistry.symbol, new DocNodeRegistry() as never);
    container.registerInstance(RenderContext.symbol, {} as never);

    const plugin = new SheetCellEditorPlugin(
      { isMergedCell: jest.fn(() => null) } as never,
      { pluginKey: 'SelectionPlugin', navigateDown: jest.fn(), restartNavigation: jest.fn() } as never,
      { subscribe: jest.fn(), setPosition: jest.fn() } as never,
      { subscribe: jest.fn() } as never,
      { start: jest.fn(() => jest.fn()), stop: jest.fn() } as never,
      { register: jest.fn() } as never,
      { override: jest.fn() } as never,
      { setInterval: jest.fn(() => 1), clearInterval: jest.fn() } as never,
      { commit: jest.fn(() => 'v') } as never,
      {
        clear: jest.fn(),
        highlight: jest.fn(() => ({
          textAttributes: [],
          cellRanges: [
            {
              kind: CellRangeHighlightKind.CellRange,
              start: [0, 0],
              end: [0, 0],
              color: '#00f',
              fill: 'rgba(0,0,255,.2)',
            },
          ],
        })),
      } as never,
      { viewToWorld: jest.fn() } as never,
      { get: jest.fn(() => void 0), register: jest.fn() } as never,
      createEmbeddedEditor(),
    ) as unknown as {
      pluginKey: unknown;
      getState(): [Rect, Rect, Rect];
      session: {
        pendingDoc: ReturnType<typeof stringToRichDoc>;
        docSelection: { head: { path: [number, number]; offset: number } };
      };
      render(core: unknown): unknown[];
      lastEditorRect: { x: number; y: number; width: number; height: number } | null;
      originalContentWidth: number;
    };

    const state = plugin.getState();
    state[1] = new Rect([
      [0, 0],
      [0, 0],
    ]);
    plugin.lastEditorRect = { x: 5, y: 5, width: 8, height: 8 };
    plugin.originalContentWidth = 0;

    let createCount = 0;
    const core = {
      configEngine: {
        getDefaultConfig: () => ({
          sheetOffsetX: 0,
          sheetOffsetY: 0,
          cellPadding: 0,
          defaultCellAlign: SheetHorizontalAlignment.Right,
        }),
      },
      getDataEngine: () =>
        createSheetDataEngine(plugin.pluginKey, state, {
          sheetData: { getItem: () => ({ value: 'x' }) },
          rowSizes: { shape: [1, 2] },
          columnSizes: { shape: [1, 2] },
          cellAlignments: { getItem: () => SheetHorizontalAlignment.Right },
        }),
      renderEngine: {
        renderContext: { measureText: () => ({ width: 0 }) },
        scrollManager: { getState: () => ({ x: 0, y: 0 }), getShape: () => [200, 120] },
        markDirty: jest.fn(),
        renderCoordinatorManager: {
          create: jest.fn(() => {
            createCount += 1;
            return createCount === 1 ? null : { render: () => null };
          }),
        },
      },
    };

    prepareRenderDocument(plugin as unknown as RuntimeSheetCellEditorPlugin, core, 'abc');
    expect(plugin.render(core as never)).toEqual([]);
  });

  it('BUG-070 grows a multiline editor upward when the next cell contains text', () => {
    jest
      .spyOn(renderModule, 'getSheetRangePositionRect')
      .mockReturnValue({ x: 10, y: 20, width: 30, height: 20 } as never);

    const docState = createDocState(12);
    const cursorManager = createCursorManager();
    container.registerInstance(SearCoreDoc.symbol, docState as never);
    container.registerInstance(DocCursorManager.symbol, cursorManager as never);
    container.registerInstance(DocNodeRegistry.symbol, new DocNodeRegistry() as never);
    container.registerInstance(RenderContext.symbol, {} as never);

    const plugin = new SheetCellEditorPlugin(
      { isMergedCell: jest.fn(() => null) } as never,
      { pluginKey: 'SelectionPlugin', navigateDown: jest.fn(), restartNavigation: jest.fn() } as never,
      { subscribe: jest.fn(), setPosition: jest.fn() } as never,
      { subscribe: jest.fn() } as never,
      { start: jest.fn(() => jest.fn()), stop: jest.fn() } as never,
      { register: jest.fn() } as never,
      { override: jest.fn() } as never,
      { setInterval: jest.fn(() => 1), clearInterval: jest.fn() } as never,
      { commit: jest.fn(() => 'v') } as never,
      {
        clear: jest.fn(),
        highlight: jest.fn(() => ({
          textAttributes: [],
          cellRanges: [
            {
              kind: CellRangeHighlightKind.CellRange,
              start: [0, 0],
              end: [0, 0],
              color: '#00f',
              fill: 'rgba(0,0,255,.2)',
            },
          ],
        })),
      } as never,
      { viewToWorld: jest.fn() } as never,
      { get: jest.fn(() => void 0), register: jest.fn() } as never,
      createEmbeddedEditor(),
    ) as unknown as {
      pluginKey: unknown;
      getState(): [Rect, Rect, Rect];
      session: {
        pendingDoc: ReturnType<typeof stringToRichDoc>;
        docSelection: {
          anchor: { path: [number, number]; offset: number };
          head: { path: [number, number]; offset: number };
        };
      };
      originalContentWidth: number;
      lastEditorRect: { height: number } | null;
      render(core: unknown): unknown[];
    };

    const state = plugin.getState();
    state[1] = new Rect([
      [1, 0],
      [1, 0],
    ]);

    let createCount = 0;
    const core = {
      configEngine: {
        getDefaultConfig: () => ({
          sheetOffsetX: 0,
          sheetOffsetY: 0,
          cellPadding: 2,
          defaultCellAlign: SheetHorizontalAlignment.Right,
        }),
      },
      getDataEngine: () =>
        createSheetDataEngine(plugin.pluginKey, state, {
          sheetData: {
            shape: [3, 2],
            getItem: (row: number) => row === 1 ? { value: 'x' } : row === 2 ? { value: 'hello world' } : null,
          },
          rowSizes: { shape: [1, 3] },
          columnSizes: { shape: [1, 2] },
          cellAlignments: { getItem: () => SheetHorizontalAlignment.Right },
        }),
      renderEngine: {
        renderContext: { measureText: () => ({ width: 2 }) },
        scrollManager: { getState: () => ({ x: 0, y: 0 }), getShape: () => [200, 120] },
        markDirty: jest.fn(),
        renderCoordinatorManager: {
          create: jest.fn((_data, rect: { y: number; height: number }) => {
            createCount += 1;
            if (createCount === 1) return { render: () => ({ properties: {} }) };
            return void 0;
          }),
        },
      },
    };

    const session = prepareRenderDocument(plugin as unknown as RuntimeSheetCellEditorPlugin, core, 'x');
    expect(plugin.render(core as never).length).toBeGreaterThan(0);
    session.reopen('line1\nline2');
    core.renderEngine.renderCoordinatorManager.create.mockClear();
    plugin.render(core as never);
    const rect = core.renderEngine.renderCoordinatorManager.create.mock.calls[0][1];
    expect(rect.height).toBeGreaterThan(20);
    expect(rect.y).toBeLessThan(20);
    expect(rect.y + rect.height).toBe(40);
  });

  it('does not mark a separate overflow dirty rect when computed overflow width is zero', () => {
    jest
      .spyOn(renderModule, 'getSheetRangePositionRect')
      .mockReturnValue({ x: 10, y: 20, width: 60, height: 24 } as never);

    const docState = createDocState(50);
    const cursorManager = createCursorManager();
    container.registerInstance(SearCoreDoc.symbol, docState as never);
    container.registerInstance(DocCursorManager.symbol, cursorManager as never);
    container.registerInstance(DocNodeRegistry.symbol, new DocNodeRegistry() as never);
    container.registerInstance(RenderContext.symbol, {} as never);

    const plugin = new SheetCellEditorPlugin(
      { isMergedCell: jest.fn(() => null) } as never,
      { pluginKey: 'SelectionPlugin', navigateDown: jest.fn(), restartNavigation: jest.fn() } as never,
      { subscribe: jest.fn(), setPosition: jest.fn() } as never,
      { subscribe: jest.fn() } as never,
      { start: jest.fn(() => jest.fn()), stop: jest.fn() } as never,
      { register: jest.fn() } as never,
      { override: jest.fn() } as never,
      { setInterval: jest.fn(() => 1), clearInterval: jest.fn() } as never,
      { commit: jest.fn(() => 'v') } as never,
      { clear: jest.fn(), highlight: jest.fn(() => ({ textAttributes: [], cellRanges: [] })) } as never,
      { viewToWorld: jest.fn() } as never,
      { get: jest.fn(() => void 0), register: jest.fn() } as never,
      createEmbeddedEditor(),
    ) as unknown as {
      pluginKey: unknown;
      getState(): [Rect, Rect, Rect];
      session: {
        pendingDoc: ReturnType<typeof stringToRichDoc>;
        docSelection: { head: { path: [number, number]; offset: number } };
      };
      computeOverflowLeftX: jest.Mock;
      render(core: unknown): unknown[];
    };

    const state = plugin.getState();
    state[1] = new Rect([
      [0, 0],
      [0, 0],
    ]);

    const core = {
      configEngine: {
        getDefaultConfig: () => ({
          sheetOffsetX: 0,
          sheetOffsetY: 0,
          cellPadding: 4,
          defaultCellAlign: SheetHorizontalAlignment.Right,
        }),
      },
      getDataEngine: () =>
        createSheetDataEngine(plugin.pluginKey, state, {
          sheetData: { getItem: () => ({ value: 'abc' }) },
          rowSizes: { shape: [1, 2] },
          columnSizes: { shape: [1, 2] },
          cellAlignments: { getItem: () => SheetHorizontalAlignment.Right },
        }),
      renderEngine: {
        renderContext: { measureText: () => ({ width: 20 }) },
        scrollManager: { getState: () => ({ x: 0, y: 0 }), getShape: () => [200, 120] },
        markDirty: jest.fn(),
        renderCoordinatorManager: {
          create: jest.fn(() => ({ render: () => ({ properties: {} }) })),
        },
      },
    };

    plugin.computeOverflowLeftX = jest.fn((_: unknown, __: unknown, ___: unknown, cellLeftX: number) => cellLeftX - 1);
    prepareRenderDocument(plugin as unknown as RuntimeSheetCellEditorPlugin, core, 'A1');
    plugin.render(core as never);

    expect(core.renderEngine.markDirty).toHaveBeenCalledTimes(1);
  });
});
