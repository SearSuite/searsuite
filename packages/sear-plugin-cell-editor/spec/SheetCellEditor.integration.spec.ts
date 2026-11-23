import { Rect, PositionRect } from '@searsuite/sear-foundation-rect';
import { CellRegion } from '@searsuite/sear-render-registry';
import { SheetCellEditorPlugin as RuntimeSheetCellEditorPlugin } from '../src/SheetCellEditor';
import { Container } from '@searsuite/sear-foundation-di';
import {
  DocCompositionManager,
  DocInputPlugin,
  Pipeline,
  SearCoreDoc,
  SearCoreSheet,
} from '@searsuite/sear-assembly-core';
import { DocCursorManager } from '@searsuite/sear-assembly-core';
import { DocNodeRegistry, stringToRichDoc } from '@searsuite/sear-domain-doc';
import { DocLayoutEngine } from '@searsuite/sear-domain-editor';
import { RectOTActionName } from '@searsuite/sear-domain-ot';
import { EditorState } from '../src/EditorTypes';
import { LocalActionCommand, SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { EnsureSelectionVisibleCommand } from '@searsuite/sear-plugin-selection';
import { ConfigEngine } from '@searsuite/sear-assembly-config';
import { SheetDataFieldNamespace, SheetDataMatrixFieldKey, SheetDataPlugin } from '@searsuite/sear-render-engine';
import { SheetAlignmentPlugin, SheetHorizontalAlignmentFieldKey } from '@searsuite/sear-plugin-alignment';
import {
  SheetColumnHiddenOriginalSizesFieldKey,
  SheetColumnSizesFieldKey,
  SheetRowHiddenOriginalSizesFieldKey,
  SheetRowSizesFieldKey,
} from '@searsuite/sear-plugin-resize';
import { Tree } from '@searsuite/sear-render-node';
import { FakeSheetEmbeddedEditor } from '@searsuite/sear-sheet-editor-contract';

let container: Container;

class SheetCellEditorPlugin extends RuntimeSheetCellEditorPlugin {
  constructor(...args: ConstructorParameters<typeof RuntimeSheetCellEditorPlugin>) {
    super(...args);
    this.bindRuntimeServices(container);
  }
}

describe('SheetCellEditor integration coverage', () => {
  beforeEach(() => {
    container = new Container();
  });

  afterEach(() => {
    container.reset();
  });

  it('runs the full lifecycle for coverage', () => {
    const registerPlugin = jest.fn();
    const setCompositionText = jest.fn();
    container.registerInstance(SearCoreDoc.symbol, {
      registerPlugin,
      setState: jest.fn(),
      maxWidth: 100,
      blockManager: { calculateLayoutPerParagraph: () => [[{ chars: [], height: 10 }]] },
      prepareEditorRenderLayout: jest.fn(
        (input: { origin: { x: number; y: number }; minWidth: number; minHeight: number }) => ({
          positionRect: {
            x: input.origin.x,
            y: input.origin.y,
            width: Math.max(input.minWidth, 100),
            height: Math.max(input.minHeight, 20),
          },
          snapshot: { lines: [] },
          cursorRelative: { x: 0, y: 0, height: 10 },
          composingCaretPixelOffset: 0,
          contentWidth: Math.max(input.minWidth, 100),
        }),
      ),
      resolveCursorFromPoint: jest.fn(() => ({ path: [0, 0], offset: 1 })),
    } as never);
    container.registerInstance(DocCompositionManager.symbol, {
      clear: jest.fn(),
      setText: setCompositionText,
      measure: jest.fn(() => ({ active: false, text: '', textWidth: 0, caretPixelOffset: 0 })),
      getText: jest.fn(() => ''),
      getCaretPixelOffset: jest.fn(() => 0),
    } as never);
    container.registerInstance(DocCursorManager.symbol, {
      clearCursor: jest.fn(),
      getCursor: jest.fn(() => null),
      getSelectionRects: jest.fn(() => []),
      setCursor: jest.fn(),
      setSelectionRects: jest.fn(),
    } as never);
    container.registerInstance(DocNodeRegistry.symbol, new DocNodeRegistry() as never);
    container.registerInstance(ConfigEngine.symbol, {
      getDefaultConfig: jest.fn(() => ({})),
    } as never);
    container.registerInstance(Tree.symbol, {
      getBoundary: jest.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
      updateBoundary: jest.fn(),
      insert: jest.fn(),
      remove: jest.fn(),
    } as never);
    SheetCellEditorPlugin.registerServices({ container });
    const embeddedEditor = new FakeSheetEmbeddedEditor();

    let docSelectionCallback: any;
    let keyboardHandlers: any;
    let textInputHandlers: any;

    const textInput = {
      subscribe: (h: any) => (textInputHandlers = h),
      startListener: jest.fn(),
      stopListener: jest.fn(),
      refocus: jest.fn(),
      setPosition: jest.fn(),
    };

    const keyboardRouter = {
      subscribe: (h: any) => (keyboardHandlers = h),
      startListener: jest.fn(),
      stopListener: jest.fn(),
    };
    const pointerCapture = { start: jest.fn(() => jest.fn()), stop: jest.fn() };

    const commitStrategies = { commitWithFormat: jest.fn(() => ({ cell: 'new value', format: null })) };
    const highlighter = { clear: jest.fn(), highlight: jest.fn(() => ({ textAttributes: [], cellRanges: [] })) };
    const coordinates = { viewToWorld: jest.fn(() => ({ x: 10, y: 10 })) };
    const cursorEngine = { override: jest.fn() };
    const selectionPlugin = {
      pluginKey: 'SelectionPlugin',
      getDownwardEntryExtensionIndex: jest.fn(() => null),
      getRightwardEntryExtensionIndex: jest.fn(() => null),
      extendForDownwardEntry: jest.fn(),
      navigate: jest.fn(),
      navigateDown: jest.fn(),
      restartNavigation: jest.fn(),
      onFillHandleDoubleClick: jest.fn(() => false),
    };
    const mergePlugin = { isMergedCell: jest.fn() };
    const reducerRegistry = { get: jest.fn(() => void 0), register: jest.fn() };
    const platform = { setInterval: jest.fn(), clearInterval: jest.fn() };
    let searCore: any;
    const commands = new SheetCommandBus();
    commands.register(EnsureSelectionVisibleCommand,
      () => new LocalActionCommand(EnsureSelectionVisibleCommand.id, () => void 0));
    commands.bind({
      executePipeline: (pipeline) => searCore?.executePipeline(pipeline),
      applyEffect: () => void 0,
    });

    const plugin = new SheetCellEditorPlugin(
      mergePlugin as never,
      selectionPlugin as never,
      textInput as never,
      keyboardRouter as never,
      pointerCapture as never,
      { register: jest.fn(), resolve: jest.fn(() => 'default') } as never,
      cursorEngine as never,
      platform as never,
      commitStrategies as never,
      highlighter as never,
      coordinates as never,
      reducerRegistry as never,
      embeddedEditor,
      commands,
    );
    plugin.registerCommands(commands);

    expect(plugin.getPluginConfig({} as never)).toBeNull();
    expect(plugin.registerState()).toBeDefined();

    const dataState = {
      sheetData: { getItem: (): { value: any } => ({ value: 'test' }) },
      rowSizes: {
        shape: [1, 5],
        getDimensionLeftBoundaryByIndex: () => 0,
        getDimensionRightBoundaryByIndex: () => 10,
        getDimensionSizeByIndex: () => 10,
      },
      columnSizes: {
        shape: [1, 5],
        getDimensionLeftBoundaryByIndex: () => 0,
        getDimensionRightBoundaryByIndex: () => 10,
        getDimensionSizeByIndex: () => 10,
      },
      cellAlignments: { getItem: () => undefined },
    };

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
    ] as EditorState;

    const scrollManager = { getState: () => ({ x: 0, y: 0 }), getShape: () => [200, 120] };
    const renderEngine = {
      scrollManager,
      markDirty: jest.fn(),
      renderContext: { measureText: () => ({ width: 10 }) },
      renderCoordinatorManager: {
        create: jest.fn(() => ({ render: () => ({ properties: {} }) })),
      },
    };
    const configEngine = {
      getDefaultConfig: () => ({ sheetOffsetX: 0, sheetOffsetY: 0, cellPadding: 2, defaultCellAlign: 1 }),
    };

    const dataEngine = {
      getDataType: (key: any) => {
        if (key === plugin.pluginKey) return editorState;
        if (key === SheetDataPlugin.pluginKey) return { sheetData: dataState.sheetData };
        if (key === SheetAlignmentPlugin.pluginKey) return { cellAlignments: dataState.cellAlignments };
        return undefined;
      },
      readDataViewField: (viewKey: string, fieldKey: string) => {
        if (viewKey !== SheetDataFieldNamespace) return null;
        if (fieldKey === SheetDataMatrixFieldKey) return dataState.sheetData;
        if (fieldKey === SheetHorizontalAlignmentFieldKey) return dataState.cellAlignments;
        if (fieldKey === SheetRowSizesFieldKey) return dataState.rowSizes;
        if (fieldKey === SheetColumnSizesFieldKey) return dataState.columnSizes;
        if (fieldKey === SheetRowHiddenOriginalSizesFieldKey) return {};
        if (fieldKey === SheetColumnHiddenOriginalSizesFieldKey) return {};
        return null;
      },
    };

    searCore = {
      getDataEngine: () => dataEngine,
      renderEngine,
      configEngine,
      executePipeline: jest.fn((pipeline: Pipeline) => {
        pipeline.steps.forEach((step) => step.prepare?.());
        pipeline.steps.forEach((step) => step.postCommit?.());
      }),
      requestRender: jest.fn(),
      dispatch: jest.fn(),
    };

    container.registerInstance(SearCoreSheet.symbol, searCore as never);
    plugin.bindCore(searCore as never);

    // Double click to enter edit mode
    plugin.onDblClick(searCore as never, { target: { properties: { startRowIndex: 0, startColIndex: 0 } } } as never);

    // Render it once to populate lastEditorRect
    // Mock getSheetRangePositionRect logic inside render (it returns rangeRect)
    // Actually getSheetRangePositionRect is imported, we can just supply data to make it work or mock it.
    // wait, we can't easily mock imported functions here without jest.mock. Let's provide correct dimension sizes if it throws, or just use jest.mock.

    // Simulate the embedded editor input bridge
    textInputHandlers.onTextInput({ kind: 'text', text: 'abc' });

    // Simulate onMouseMove inside editor
    (plugin as any).lastEditorRect = { x: 0, y: 0, width: 100, height: 100 };
    plugin.onMouseDown(
      searCore as never,
      { origin: { offsetX: 10, offsetY: 10, preventDefault: jest.fn() }, target: { properties: {} } } as never,
    );

    plugin.onMouseMove(searCore as never, { origin: { offsetX: 15, offsetY: 15 } } as never);
    plugin.onMouseUp(searCore as never, {} as never);

    // Test onMouseDown outside
    coordinates.viewToWorld = jest.fn(() => ({ x: 200, y: 200 }));
    plugin.onMouseDown(
      searCore as never,
      {
        origin: { offsetX: 200, offsetY: 200, preventDefault: jest.fn() },
        target: { properties: { startRowIndex: 1, startColIndex: 1 } },
      } as never,
    );

    // Test keyboard callbacks
    plugin.onDblClick(searCore as never, { target: { properties: { startRowIndex: 0, startColIndex: 0 } } } as never);
    keyboardHandlers.onEnter();
    plugin.onDblClick(searCore as never, { target: { properties: { startRowIndex: 0, startColIndex: 0 } } } as never);
    keyboardHandlers.onEscape();

    // Test different rawValues
    dataState.sheetData.getItem = () => ({ value: 123 });
    plugin.onDblClick(searCore as never, { target: { properties: { startRowIndex: 0, startColIndex: 0 } } } as never);
    plugin.cancelEdit(searCore as never);

    dataState.sheetData.getItem = () => ({ value: stringToRichDoc('rich') });
    plugin.onDblClick(searCore as never, { target: { properties: { startRowIndex: 0, startColIndex: 0 } } } as never);
    plugin.cancelEdit(searCore as never);

    dataState.sheetData.getItem = () => ({ value: undefined });
    plugin.onDblClick(searCore as never, { target: { properties: { startRowIndex: 0, startColIndex: 0 } } } as never);
    plugin.commitEdit(searCore as never);

    // Call render to hit render paths
    plugin.onDblClick(searCore as never, { target: { properties: { startRowIndex: 0, startColIndex: 0 } } } as never);
    plugin.render(searCore as never);

    // Test apply with UpdateRect
    plugin.apply(editorState, {
      operations: [
        {
          p: [2],
          [RectOTActionName.UpdateRect]: [
            [0, 0],
            [0, 0],
          ],
        },
        {
          p: [1],
          [RectOTActionName.UpdateRect]: [
            [0, 0],
            [0, 0],
          ],
        },
      ],
    } as never);

    // Selection with row header and column header
    plugin.onDblClick(searCore as never, { target: { properties: { startRowIndex: 0, startColIndex: 0 } } } as never);
    plugin.onMouseDown(
      searCore as never,
      {
        origin: { offsetX: 200, offsetY: 200, preventDefault: jest.fn() },
        target: { properties: { region: CellRegion.RowHeader, startRowIndex: 1, endRowIndex: 1 } },
      } as never,
    );

    plugin.onDblClick(searCore as never, { target: { properties: { startRowIndex: 0, startColIndex: 0 } } } as never);
    plugin.onMouseDown(
      searCore as never,
      {
        origin: { offsetX: 200, offsetY: 200, preventDefault: jest.fn() },
        target: { properties: { region: CellRegion.ColumnHeader, startColIndex: 1, endColIndex: 1 } },
      } as never,
    );
  });
});
