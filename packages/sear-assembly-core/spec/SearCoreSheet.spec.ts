import { SearCoreSheet } from '../src/SearCoreSheet';
import { SheetMatrix } from '../src';
import { PluginKey, PluginManager } from '@searsuite/sear-assembly-plugin';
import { Pipeline, PipelineStepKind } from '../src/Pipeline';
import { runInsideCommandExecution } from '../src/CommandExecutionScope';
import { PositionRect } from '@searsuite/sear-foundation-rect';
import { CSRMatrix, ColumnShapeDimensionsCSRMatrix, RowShapeDimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { MatrixOTActionName } from '@searsuite/sear-domain-ot';
import { createTransaction, Transaction } from '@searsuite/sear-domain-transaction';
import {
  SheetDataFieldNamespace,
  SheetDataMatrixFieldKey,
  SheetDataEngine,
  SheetDataPlugin,
} from '@searsuite/sear-render-engine';
import { SheetAlignmentPlugin, SheetHorizontalAlignmentFieldKey } from '@searsuite/sear-plugin-alignment';
import {
  SheetColumnHiddenOriginalSizesFieldKey,
  SheetColumnSizesFieldKey,
  SheetResizePlugin,
  SheetRowHiddenOriginalSizesFieldKey,
  SheetRowSizesFieldKey,
} from '@searsuite/sear-plugin-resize';

interface TestSheetViewState {
  sheetData: unknown;
  cellAlignments: unknown;
  rowSizes: unknown;
  columnSizes: unknown;
  rowHiddenOriginalSizes: unknown;
  columnHiddenOriginalSizes: unknown;
}

function createSheetViewState(state: {
  sheetData: unknown;
  rowSizes?: unknown;
  columnSizes?: unknown;
  cellAlignments?: unknown;
}): TestSheetViewState {
  const defaultDimensions = {
    shape: [1, 1],
    getDimensionRightBoundaryByIndex: () => 0,
  };
  return {
    sheetData: state.sheetData,
    cellAlignments: state.cellAlignments ?? {},
    rowSizes: state.rowSizes ?? defaultDimensions,
    columnSizes: state.columnSizes ?? defaultDimensions,
    rowHiddenOriginalSizes: {},
    columnHiddenOriginalSizes: {},
  };
}

function createSheetViewDataTypeReader(state: {
  sheetData: unknown;
  rowSizes?: unknown;
  columnSizes?: unknown;
  cellAlignments?: unknown;
}): (key: unknown) => unknown {
  const view = createSheetViewState(state);
  return (key: unknown) => {
    if (key === SheetDataPlugin.pluginKey) return { sheetData: view.sheetData };
    if (key === SheetAlignmentPlugin.pluginKey) return { cellAlignments: view.cellAlignments };
    if (key === SheetResizePlugin.pluginKey) {
      return {
        dimensions: {
          rowSizes: view.rowSizes,
          columnSizes: view.columnSizes,
          rowHiddenOriginalSizes: view.rowHiddenOriginalSizes,
          columnHiddenOriginalSizes: view.columnHiddenOriginalSizes,
        },
      };
    }
    return null;
  };
}

function createSheetDataFieldReader(state: {
  sheetData: unknown;
  rowSizes?: unknown;
  columnSizes?: unknown;
  cellAlignments?: unknown;
}): (viewKey: string, fieldKey: string) => unknown {
  const view = createSheetViewState(state);
  return (viewKey: string, fieldKey: string) => {
    if (viewKey !== SheetDataFieldNamespace) return void 0;
    if (fieldKey === SheetDataMatrixFieldKey) return view.sheetData;
    if (fieldKey === SheetHorizontalAlignmentFieldKey) return view.cellAlignments;
    if (fieldKey === SheetRowSizesFieldKey) return view.rowSizes;
    if (fieldKey === SheetColumnSizesFieldKey) return view.columnSizes;
    if (fieldKey === SheetRowHiddenOriginalSizesFieldKey) return view.rowHiddenOriginalSizes;
    if (fieldKey === SheetColumnHiddenOriginalSizesFieldKey) return view.columnHiddenOriginalSizes;
    return void 0;
  };
}

function registerSheetViewState(
  dataEngine: SheetDataEngine,
  state: {
    sheetData: unknown;
    rowSizes?: unknown;
    columnSizes?: unknown;
    cellAlignments?: unknown;
  },
): void {
  dataEngine.registerDataType(
    SheetDataPlugin.pluginKey,
    { sheetData: state.sheetData },
    {
      dataView: [
        {
          viewKey: SheetDataFieldNamespace,
          fieldKey: SheetDataMatrixFieldKey,
          select: (pluginState) => pluginState.sheetData,
        },
      ],
    },
  );
  dataEngine.registerDataType(
    SheetAlignmentPlugin.pluginKey,
    { cellAlignments: state.cellAlignments ?? {} },
    {
      dataView: [
        {
          viewKey: SheetDataFieldNamespace,
          fieldKey: SheetHorizontalAlignmentFieldKey,
          select: (pluginState) => pluginState.cellAlignments,
        },
      ],
    },
  );
  dataEngine.registerDataType(
    SheetResizePlugin.pluginKey,
    {
      dimensions: {
        rowSizes: state.rowSizes ?? {},
        columnSizes: state.columnSizes ?? {},
        rowHiddenOriginalSizes: {},
        columnHiddenOriginalSizes: {},
      },
    },
    {
      dataView: [
        {
          viewKey: SheetDataFieldNamespace,
          fieldKey: SheetRowSizesFieldKey,
          select: (resizeState) => resizeState.dimensions.rowSizes,
        },
        {
          viewKey: SheetDataFieldNamespace,
          fieldKey: SheetColumnSizesFieldKey,
          select: (resizeState) => resizeState.dimensions.columnSizes,
        },
        {
          viewKey: SheetDataFieldNamespace,
          fieldKey: SheetRowHiddenOriginalSizesFieldKey,
          select: (resizeState) => resizeState.dimensions.rowHiddenOriginalSizes,
        },
        {
          viewKey: SheetDataFieldNamespace,
          fieldKey: SheetColumnHiddenOriginalSizesFieldKey,
          select: (resizeState) => resizeState.dimensions.columnHiddenOriginalSizes,
        },
      ],
    },
  );
}

function createCoreWithPlugins(
  plugins: unknown[],
  dataEngine: SheetDataEngine,
  extraExecutors: Map<string, { kind: string; execute: (context: any, step: any) => void }> = new Map(),
  interactionStore: unknown = {
    getState: jest.fn(() => ({})),
    reduce: jest.fn((state) => state),
    commit: jest.fn(),
  },
  platform?: {
    requestAnimationFrame: (callback: FrameRequestCallback) => number;
    cancelAnimationFrame: (handle: number) => void;
  },
): SearCoreSheet {
  if (typeof dataEngine.enforceWriteBoundary !== 'function') {
    (dataEngine as SheetDataEngine).enforceWriteBoundary = jest.fn();
  }
  const pluginManager: any = {
    getAllPlugins: jest.fn(() => []),
    getPluginState: jest.fn(() => null),
    forEach: jest.fn((callback: (plugin: any) => void) => {
      plugins.forEach((plugin) => callback(plugin));
    }),
  };
  const stepExecutorRegistry: any = {
    get: jest.fn((kind) => extraExecutors.get(kind)),
    register: jest.fn((executor) => {
      extraExecutors.set(executor.kind, executor);
      return () => {};
    }),
  };
  return new SearCoreSheet(
    { addPluginNode: jest.fn(), positionRectStorage: null } as any,
    pluginManager,
    dataEngine,
    {
      markDirty: jest.fn(),
      render: jest.fn(),
      invalidateScreenCache: jest.fn(),
      scrollManager: {
        subscribeScroll: jest.fn(() => jest.fn()),
        destroy: jest.fn(),
        getShape: jest.fn(() => [10, 10]),
        hasUnrenderedScroll: jest.fn(() => true),
        setContentBoundary: jest.fn(),
      },
    } as any,
    {
      render: jest.fn(),
      renderHitOnNextFrame: jest.fn(),
      eventRegistrar: { registeredEvents: [] },
      registerEvent: jest.fn(),
      destroy: jest.fn(),
    } as any,
    {} as any,
    { start: jest.fn(), destroy: jest.fn() } as any,
    interactionStore as any,
    stepExecutorRegistry,
    platform as never,
  );
}

describe('SearCoreSheet coverage', () => {
  it('keeps the owning plugin manager fixed after core construction', () => {
    const core = createCoreWithPlugins([], {} as SheetDataEngine);
    const manager = core.pluginManager;

    expect(() => Object.assign(core, { pluginManager: new PluginManager() })).toThrow();
    expect(core.pluginManager).toBe(manager);
  });

  it('rejects state-changing pipeline steps outside command dispatch after assembly enables the boundary', () => {
    const core = createCoreWithPlugins([], {} as SheetDataEngine);
    const change = jest.fn();
    let executing = false;
    core.enforceCommandBoundary(() => executing);
    expect(() => core.executePipeline(new Pipeline('outside').addLocalAction('change', change)))
      .toThrow('editor.commands.run');
    expect(() => runInsideCommandExecution('other-editor', () =>
      core.executePipeline(new Pipeline('cross-editor').addLocalAction('change', change))))
      .toThrow('editor.commands.run');
    expect(change).not.toHaveBeenCalled();
    executing = true;
    core.executePipeline(new Pipeline('inside').addLocalAction('change', change));
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('previews projected transaction states without publishing them', () => {
    const key = new PluginKey('preview-owner');
    const projectedKey = new PluginKey('preview-projection');
    const committed = { value: 'before' };
    const projectedCommitted = { value: 'before' };
    const owner = {
      key,
      getState: () => committed,
      apply: jest.fn((state: typeof committed) => {
        state.value = 'after';
        return state;
      }),
      setState: jest.fn(),
    };
    const projection = {
      key: projectedKey,
      getState: () => projectedCommitted,
      projectTransaction: () => [createTransaction(projectedKey, [
        { p: [0, 0], [MatrixOTActionName.UpdateCell]: { value: 'projected', prev: 'before' } },
      ])],
      apply: jest.fn((state: typeof projectedCommitted) => {
        state.value = 'projected';
        return state;
      }),
      setState: jest.fn(),
    };
    const dataEngine = new SheetDataEngine();
    dataEngine.registerDataType(key, committed);
    dataEngine.registerDataType(projectedKey, projectedCommitted);
    const core = createCoreWithPlugins([owner, projection], dataEngine);
    let executing = false;
    core.enforceCommandBoundary(() => executing);

    expect(() => core.previewTransactionStates([createTransaction(key)])).toThrow('editor.commands.run');
    executing = true;
    const preview = core.previewTransactionStates([createTransaction(key)]);

    expect(preview.get(key)).toEqual({ value: 'after' });
    expect(preview.get(projectedKey)).toEqual({ value: 'projected' });
    expect(committed.value).toBe('before');
    expect(projectedCommitted.value).toBe('before');
    expect(owner.setState).not.toHaveBeenCalled();
    expect(projection.setState).not.toHaveBeenCalled();
  });
  it('rejects state-changing steps added by pipeline lifecycle hooks outside command dispatch', () => {
    const core = createCoreWithPlugins([], new SheetDataEngine());
    const change = jest.fn();
    core.enforceCommandBoundary(() => false);

    const addedOnStart = new Pipeline('hook-added-step').addRender('refresh', new PluginKey('refresh'));
    addedOnStart.use({ onStart: (pipeline) => { pipeline.addLocalAction('change', change); } });
    expect(() => core.executePipeline(addedOnStart)).toThrow('editor.commands.run');

    const changedOnStepStart = new Pipeline('hook-mutated-step').addRender('refresh', new PluginKey('refresh'));
    changedOnStepStart.use({ onStepStart: (step) => {
      step.kind = PipelineStepKind.LocalAction;
      step.localAction = change;
    } });
    expect(() => core.executePipeline(changedOnStepStart)).toThrow('editor.commands.run');
    expect(change).not.toHaveBeenCalled();
  });

  it('rejects a transaction requested by a render executor outside command dispatch', () => {
    const key = new PluginKey('render-executor-transaction');
    const state = { value: 0 };
    const plugin = {
      key,
      getState: () => state,
      apply: jest.fn((previous: typeof state) => ({ value: previous.value + 1 })),
      setState: jest.fn(),
    };
    const dataEngine = new SheetDataEngine();
    dataEngine.registerDataType(key, state);
    const executors = new Map<string, { kind: string; execute: (context: any, step: any) => void }>();
    executors.set(PipelineStepKind.Render, {
      kind: PipelineStepKind.Render,
      execute: (context) => context.executeTransaction({
        name: 'hidden-transaction',
        kind: PipelineStepKind.Transaction,
        transaction: createTransaction(key),
      }),
    });
    const core = createCoreWithPlugins([plugin], dataEngine, executors);
    core.enforceCommandBoundary(() => false);

    expect(() => core.executePipeline(new Pipeline('render-executor').addRender('refresh', key)))
      .toThrow('editor.commands.run');
    expect(plugin.apply).not.toHaveBeenCalled();
    expect(plugin.setState).not.toHaveBeenCalled();
    expect(dataEngine.getDataType(key)).toEqual({ value: 0 });
  });
  it('coalesces multiple scroll updates into one visual frame', () => {
    const render = jest.fn(() => []);
    const frameCallbacks: FrameRequestCallback[] = [];
    const platform = {
      requestAnimationFrame: jest.fn((callback: FrameRequestCallback) => {
        frameCallbacks.push(callback);
        return 17;
      }),
      cancelAnimationFrame: jest.fn(),
    };
    const core = createCoreWithPlugins(
      [{ key: new PluginKey('scroll-plugin'), apply: jest.fn(), render }],
      { getDataType: jest.fn(), readDataViewField: jest.fn() } as unknown as SheetDataEngine,
      new Map(),
      void 0,
      platform,
    );

    const scrollCore = core as unknown as { handleScrollReRender(state: unknown): void };
    scrollCore.handleScrollReRender({});
    scrollCore.handleScrollReRender({});

    expect(platform.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();

    frameCallbacks[0](0);

    expect(render).toHaveBeenCalledTimes(1);
    expect(core.getStage().addPluginNode).toHaveBeenCalledWith('scroll-plugin$', [], { markDirty: false });
    expect(core.renderEngine.render as jest.Mock).toHaveBeenCalledWith(core.getStage());
    expect(core.eventEngine.renderHitOnNextFrame as jest.Mock).toHaveBeenCalledWith(core.getStage());
  });

  it('repaints regenerated cells after an earlier command consumes the scroll delta', () => {
    const core = createCoreWithPlugins(
      [{ key: new PluginKey('scroll-plugin'), apply: jest.fn(), render: jest.fn(() => []) }],
      { getDataType: jest.fn(), readDataViewField: jest.fn() } as unknown as SheetDataEngine,
    );
    (core.renderEngine.scrollManager.hasUnrenderedScroll as jest.Mock).mockReturnValue(false);

    (core as unknown as { renderScrollFrame(): void }).renderScrollFrame();

    expect(core.renderEngine.invalidateScreenCache).toHaveBeenCalledTimes(1);
    expect(core.renderEngine.render).toHaveBeenCalledWith(core.getStage());
  });

  it('cancels a pending scroll frame and ignores its late callback during destruction', () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    const platform = {
      requestAnimationFrame: jest.fn((callback: FrameRequestCallback) => {
        frameCallbacks.push(callback);
        return 29;
      }),
      cancelAnimationFrame: jest.fn(),
    };
    const core = createCoreWithPlugins(
      [{ key: new PluginKey('scroll-plugin'), apply: jest.fn(), render: jest.fn(() => []) }],
      { getDataType: jest.fn(), readDataViewField: jest.fn() } as unknown as SheetDataEngine,
      new Map(),
      void 0,
      platform,
    );
    const scrollCore = core as unknown as { handleScrollReRender(state: unknown): void };

    scrollCore.handleScrollReRender({});
    core.destroy();
    frameCallbacks[0](0);

    expect(platform.cancelAnimationFrame).toHaveBeenCalledWith(29);
    expect(core.eventEngine.destroy).toHaveBeenCalledTimes(1);
    expect(core.renderEngine.render as jest.Mock).not.toHaveBeenCalled();
  });

  it('ignores forged lifecycle fields when destroying a direct test core', () => {
    const core = createCoreWithPlugins([], {
      getDataType: jest.fn(),
      readDataViewField: jest.fn(),
    } as unknown as SheetDataEngine);
    const forged = core as unknown as { scrollRenderFrame: number | null; destroyed: boolean };
    forged.scrollRenderFrame = 31;
    forged.destroyed = true;

    core.destroy();

    expect(core.eventEngine.destroy).toHaveBeenCalledTimes(1);
    expect(core.renderEngine.scrollManager.destroy).toHaveBeenCalledTimes(1);
  });

  it('sets scroll boundaries from the sheet content viewport after header offsets are reserved', () => {
    const rowSizes = {
      shape: [1, 1_048_576],
      getDimensionRightBoundaryByIndex: jest.fn(() => 25_165_824),
    };
    const columnSizes = {
      shape: [1, 16_384],
      getDimensionRightBoundaryByIndex: jest.fn(() => 1_638_400),
    };
    const dataEngine = {
      getDataType: jest.fn(),
      readDataViewField: createSheetDataFieldReader({
        sheetData: {},
        rowSizes,
        columnSizes,
      }),
    } as unknown as SheetDataEngine;
    const core = createCoreWithPlugins([], dataEngine);
    core.configEngine = {
      getDefaultConfig: () => ({
        sheetOffsetX: 50,
        sheetOffsetY: 24,
      }),
    } as never;
    core.renderEngine.scrollManager.getShape = jest.fn(() => [800, 600]);

    (core as unknown as { expandTreeBoundaryToSheetSize(): void }).expandTreeBoundaryToSheetSize();

    expect(core.renderEngine.scrollManager.setContentBoundary).toHaveBeenCalledWith(
      1_638_400 - (800 - 50),
      25_165_824 - (600 - 24),
    );
  });

  it('covers missing lines', () => {
    const pluginManager = {
      getAllPlugins: jest.fn(() => []),
      getPluginState: jest.fn(),
      forEach: jest.fn(),
    };

    const renderEngine = {
      markDirty: jest.fn(),
      render: jest.fn(),
      scrollManager: {
        subscribeScroll: jest.fn(() => jest.fn()),
        destroy: jest.fn(),
        getShape: jest.fn(() => [100, 100]),
        setContentBoundary: jest.fn(),
      },
    };
    const eventEngine = {
      render: jest.fn(),
      eventRegistrar: { registeredEvents: [] },
      registerEvent: jest.fn(),
      destroy: jest.fn(),
    };
    const configEngine = {};
    const dataEngine = {
      getDataType: jest.fn(() => void 0),
      readDataViewField: jest.fn(() => void 0),
      enforceWriteBoundary: jest.fn(),
    };
    const sceneGraph = {};
    const lifecycleCoordinator = { start: jest.fn(), destroy: jest.fn() };
    const interactionStore = { apply: jest.fn() };

    const executors = new Map();
    const stepExecutorRegistry = {
      get: jest.fn((kind) => executors.get(kind)),
      register: jest.fn((exec) => {
        executors.set(exec.kind, exec);
        return () => {};
      }),
    };

    const core = new SearCoreSheet(
      sceneGraph as any,
      pluginManager as any,
      dataEngine as any,
      renderEngine as any,
      eventEngine as any,
      configEngine as any,
      lifecycleCoordinator as any,
      interactionStore as any,
      stepExecutorRegistry as any,
    );

    // 1. Line 87: getPlugin
    core.getPlugin(new PluginKey('test'));
    expect(pluginManager.getPluginState).toHaveBeenCalled();

    // 2. Line 151: processInitialData with onInitialDataCell
    const plugin = {
      onInitialDataCell: jest.fn(),
      onInitialDataComplete: jest.fn(),
    };
    (pluginManager.getAllPlugins as jest.Mock).mockReturnValue([plugin as any]);

    const mockData = {
      forEachStored: jest.fn((cb) => cb('cell', 1, 2)),
    };
    (dataEngine.getDataType as jest.Mock).mockImplementation(createSheetViewDataTypeReader({ sheetData: mockData }));
    (dataEngine.readDataViewField as jest.Mock).mockImplementation(createSheetDataFieldReader({ sheetData: mockData }));

    core.initialize();

    expect(plugin.onInitialDataCell).toHaveBeenCalledWith(core, 'cell', 1, 2);
    expect(plugin.onInitialDataComplete).toHaveBeenCalledWith(core);

    // 3. Line 263 and 277: markDirty in executePipeline
    const pipeline = new Pipeline('test');

    pipeline.addCustom('testStep', 'testKind', {});
    executors.set('testKind', {
      kind: 'testKind',
      execute: (context: any) => {
        context.markDirty(new PositionRect(0, 0, 10, 10));
      },
    });

    pipeline.dirtyRects.push(new PositionRect(0, 0, 20, 20));

    core.executePipeline(pipeline);

    expect(renderEngine.markDirty).toHaveBeenCalledTimes(2);
    expect(renderEngine.markDirty).toHaveBeenCalledTimes(2);

    const localActionPipeline = new Pipeline('local-action');
    localActionPipeline.steps.push({ name: 'noop-local-action', kind: PipelineStepKind.LocalAction });
    expect(() => core.executePipeline(localActionPipeline)).not.toThrow();

    // 4. Line 92, 101, 102: initialize and start already called
    core.initialize(); // hits initialized = true
    core.start(); // hits initialized = true, and started = true
    core.start(); // hits started = true

    // 5. Line 127: stopScrollReRender optional chaining
    core.destroy();
    core.destroy(); // hits destroyed = true

    // 6. Missing executor
    const pipelineMissing = new Pipeline('missing');
    pipelineMissing.addCustom('missingStep', 'missingKind', {});
    expect(() => core.executePipeline(pipelineMissing)).toThrow();

    // 8. Line 396: expandTreeBoundaryToSheetSize with no state
    (core as any).expandTreeBoundaryToSheetSize(); // should return early
  });

  it('covers uncovered branch fallbacks and no-op guards', () => {
    const pluginKeyA = new PluginKey('plugin-a');
    const pluginKeyB = new PluginKey('plugin-b');

    const pluginManager: any = {
      getAllPlugins: jest.fn(() => []),
      getPluginState: jest.fn(() => null),
      forEach: jest.fn(),
    };

    const stage = {
      addPluginNode: jest.fn(),
      positionRectStorage: null,
    };

    const renderEngine = {
      markDirty: jest.fn(),
      render: jest.fn(),
      scrollManager: {
        subscribeScroll: jest.fn(() => jest.fn()),
        destroy: jest.fn(),
        getShape: jest.fn(() => [100, 100]),
        setContentBoundary: jest.fn(),
      },
    };

    const eventEngine = {
      render: jest.fn(),
      renderHitOnNextFrame: jest.fn(),
      eventRegistrar: { registeredEvents: [] },
      registerEvent: jest.fn(),
      destroy: jest.fn(),
    };
    const configEngine = {};
    const dataEngine = {
      getDataType: jest.fn(() => null),
      readDataViewField: jest.fn(() => void 0),
      registerDataType: jest.fn(),
      enforceWriteBoundary: jest.fn(),
    };
    const lifecycleCoordinator = { start: jest.fn(), destroy: jest.fn() };
    const interactionStore = { apply: jest.fn() };

    const executors = new Map<string, { kind: string; execute: (context: any, step: any) => void }>();
    const stepExecutorRegistry: any = {
      get: jest.fn((kind) => executors.get(kind)),
      register: jest.fn((exec) => {
        executors.set(exec.kind, exec);
      }),
    };

    const core = new SearCoreSheet(
      stage as any,
      pluginManager as any,
      dataEngine as any,
      renderEngine as any,
      eventEngine as any,
      configEngine as any,
      lifecycleCoordinator as any,
      interactionStore as any,
      stepExecutorRegistry as any,
    );

    // start() should initialize lazily when not initialized.
    core.start();
    expect(pluginManager.getAllPlugins).toHaveBeenCalled();

    // processInitialData should tolerate plugins without onInitialDataCell.
    const cellOnlyComplete = {
      key: pluginKeyA,
      onInitialDataComplete: jest.fn(),
      apply: jest.fn(() => false),
      render: jest.fn(() => []),
    };
    const state = {
      sheetData: {
        forEachStored: jest.fn((cb: (cell: unknown, row: number, col: number) => void) => cb('v', 0, 0)),
      },
      rowSizes: { shape: [0, 1], getDimensionRightBoundaryByIndex: jest.fn(() => 0) },
      columnSizes: { shape: [0, 1], getDimensionRightBoundaryByIndex: jest.fn(() => 0) },
    };
    pluginManager.getAllPlugins.mockReturnValue([cellOnlyComplete]);
    (dataEngine.getDataType as jest.Mock).mockImplementation(createSheetViewDataTypeReader(state));
    (dataEngine.readDataViewField as jest.Mock).mockImplementation(createSheetDataFieldReader(state));
    const initialDataCore = new SearCoreSheet(
      stage as any,
      pluginManager as any,
      dataEngine as any,
      renderEngine as any,
      eventEngine as any,
      configEngine as any,
      lifecycleCoordinator as any,
      interactionStore as any,
      stepExecutorRegistry as any,
    );
    initialDataCore.initialize();
    expect(cellOnlyComplete.onInitialDataComplete).toHaveBeenCalledWith(initialDataCore);

    const passivePlugin = {
      key: pluginKeyA,
      apply: jest.fn(() => true),
      render: jest.fn(() => []),
      dirtyRect: jest.fn(() => void 0),
    };
    const noRenderPlugin = {
      key: pluginKeyB,
      apply: jest.fn(() => false),
    };
    pluginManager.forEach.mockImplementation((cb: (plugin: any) => void) => {
      cb(passivePlugin);
      cb(noRenderPlugin);
    });

    // executeTransactionStep: plugin.render(this) || [] fallback and missing render handler path.
    const txPipeline = Pipeline.fromTransaction('plugin-a', {
      pluginKey: pluginKeyA,
      operations: [{ p: [0], ri: ['x'] }],
    } as any);
    core.executePipeline(txPipeline);
    expect(stage.addPluginNode).toHaveBeenCalledWith(pluginKeyA.key, []);

    const renderHitPipeline = new Pipeline('render-hit');
    renderHitPipeline.addRender('render-hit', pluginKeyA);
    core.executePipeline(renderHitPipeline);
    expect(stage.addPluginNode).toHaveBeenCalledWith(pluginKeyA.key, []);

    // renderPluginStep false path (non-matching plugin key) and applyInteraction false path.
    const renderMissPipeline = new Pipeline('render-miss');
    renderMissPipeline.addRender('render-miss', new PluginKey('plugin-miss'));
    renderMissPipeline.addInteraction('interaction-empty', void 0 as any);
    core.executePipeline(renderMissPipeline);

    // postRender path with render() returning undefined should still append [].
    const postRenderPipeline = new Pipeline('post-render');
    postRenderPipeline.addPostRender('post-render', pluginKeyA);
    core.executePipeline(postRenderPipeline);
    expect(stage.addPluginNode).toHaveBeenCalledWith(pluginKeyA.key, []);

    // handleScrollReRender should skip plugins without render and support fallback for undefined render output.
    (core as any).handleScrollReRender({});
    expect(eventEngine.renderHitOnNextFrame).toHaveBeenCalled();

    // expandTreeBoundaryToSheetSize with missing tree should skip tree-update branch.
    (core as any).expandTreeBoundaryToSheetSize();

    const tree = {
      getBoundary: jest.fn(() => ({ x: 0, y: 0, width: 20, height: 20 })),
      updateBoundary: jest.fn(),
    };
    (stage as any).positionRectStorage = tree;
    (dataEngine.getDataType as jest.Mock).mockImplementation(createSheetViewDataTypeReader(state));
    (dataEngine.readDataViewField as jest.Mock).mockImplementation(createSheetDataFieldReader(state));
    (core as any).expandTreeBoundaryToSheetSize();
    expect(tree.updateBoundary).toHaveBeenCalled();

    const stopSpy = renderEngine.scrollManager.subscribeScroll.mock.results[0].value;
    core.destroy();
    expect(stopSpy).toHaveBeenCalledTimes(1);

    // registerBuiltInPipelineStepExecutor should not register duplicate kinds.
    const duplicate = { kind: PipelineStepKind.Transaction, execute: jest.fn() };
    (core as any).registerBuiltInPipelineStepExecutor(duplicate);
    const duplicateRegisters = stepExecutorRegistry.register.mock.calls.filter(
      (args: any[]) => args[0].kind === duplicate.kind,
    );
    expect(duplicateRegisters.length).toBe(1);
  });

  it('covers remaining render fallback and tree guard branches', () => {
    const pluginKey = new PluginKey('branch-plugin');

    const pluginManager: any = {
      getAllPlugins: jest.fn(() => []),
      getPluginState: jest.fn(() => null),
      forEach: jest.fn(),
    };

    const stage: any = {
      addPluginNode: jest.fn(),
      positionRectStorage: void 0,
    };

    const renderEngine: any = {
      markDirty: jest.fn(),
      render: jest.fn(),
      scrollManager: {
        subscribeScroll: jest.fn(() => jest.fn()),
        destroy: jest.fn(),
        getShape: jest.fn(() => [50, 50]),
        setContentBoundary: jest.fn(),
      },
    };

    const eventEngine: any = {
      render: jest.fn(),
      renderHitOnNextFrame: jest.fn(),
      eventRegistrar: { registeredEvents: [] },
      registerEvent: jest.fn(),
      destroy: jest.fn(),
    };

    const dataEngine: any = {
      getDataType: jest.fn(() => ({
        rowSizes: { shape: [0, 1], getDimensionRightBoundaryByIndex: jest.fn(() => 10) },
        columnSizes: { shape: [0, 1], getDimensionRightBoundaryByIndex: jest.fn(() => 10) },
      })),
      readDataViewField: jest.fn(
        createSheetDataFieldReader({
          sheetData: {},
          rowSizes: { shape: [0, 1], getDimensionRightBoundaryByIndex: jest.fn(() => 10) },
          columnSizes: { shape: [0, 1], getDimensionRightBoundaryByIndex: jest.fn(() => 10) },
        }),
      ),
      registerDataType: jest.fn(),
      enforceWriteBoundary: jest.fn(),
    };

    const executors = new Map<string, { kind: string; execute: (context: any, step: any) => void }>();
    const stepExecutorRegistry: any = {
      get: jest.fn((kind) => executors.get(kind)),
      register: jest.fn((exec) => {
        executors.set(exec.kind, exec);
      }),
    };

    const core = new SearCoreSheet(
      stage,
      pluginManager,
      dataEngine,
      renderEngine,
      eventEngine,
      {} as any,
      { start: jest.fn(), destroy: jest.fn() } as any,
      { apply: jest.fn() } as any,
      stepExecutorRegistry,
    );

    const fallbackPlugin = {
      key: pluginKey,
      render: jest.fn(() => void 0),
      apply: jest.fn(() => true),
      dirtyRect: jest.fn(() => void 0),
    };

    pluginManager.forEach.mockImplementation((cb: (plugin: any) => void) => cb(fallbackPlugin));

    // executeTransactionStep fallback: plugin.render(this) || []
    const txPipeline = Pipeline.fromTransaction('branch-plugin', {
      pluginKey,
      operations: [{ p: [0], ri: ['x'] }],
    } as any);
    core.executePipeline(txPipeline);

    // renderPluginStep fallback: plugin.render(this) || []
    const renderPipeline = Pipeline.fromRender('branch-render', pluginKey);
    core.executePipeline(renderPipeline);

    // postRender fallback: plugin.render(this) || []
    const postRenderPipeline = new Pipeline('branch-post-render');
    postRenderPipeline.addPostRender('branch-post-render', pluginKey);
    core.executePipeline(postRenderPipeline);

    // handleScrollReRender fallback: plugin.render(this) || []
    (core as any).handleScrollReRender({});

    // A real start owns the scroll subscription released by destroy.
    const stop = jest.fn();
    renderEngine.scrollManager.subscribeScroll.mockReturnValue(stop);
    core.start();
    core.destroy();
    expect(stop).toHaveBeenCalledTimes(1);

    // expandTreeBoundaryToSheetSize: state exists but tree is absent (if false branch)
    (core as any).expandTreeBoundaryToSheetSize();

    // expandTreeBoundaryToSheetSize: DataEngine without data-view field capability.
    const originalDataEngine = (core as any).dataEngine;
    (core as any).dataEngine = { getDataType: jest.fn() };
    (core as any).expandTreeBoundaryToSheetSize();
    (core as any).dataEngine = originalDataEngine;

    // processInitialData: consumer exists but sheet data field is unavailable.
    const initialDataConsumer = { onInitialDataCell: jest.fn(), onInitialDataComplete: jest.fn() };
    dataEngine.readDataViewField.mockReturnValueOnce(null);
    (core as any).processInitialData([initialDataConsumer]);
    expect(initialDataConsumer.onInitialDataCell).not.toHaveBeenCalled();

    // handlePlugin: private state can opt out of DataEngine registration.
    (core as any).handlePlugin([
      {
        registerState: () => ({
          key: new PluginKey('private-state'),
          state: {},
          dataEngine: { enabled: false },
        }),
      },
    ]);
    expect(dataEngine.registerDataType).not.toHaveBeenCalledWith(new PluginKey('private-state'), expect.anything());

    // executeTransactionStep: dirtyRect can mark a concrete dirty rectangle instead of re-rendering plugin nodes.
    (fallbackPlugin.dirtyRect as jest.Mock).mockReturnValueOnce(new PositionRect(1, 2, 3, 4));
    core.executePipeline(txPipeline);
    expect(renderEngine.markDirty).toHaveBeenCalledWith(expect.objectContaining({ x: 1, y: 2, width: 3, height: 4 }));

    expect(stage.addPluginNode).toHaveBeenCalledWith(pluginKey.key, []);
  });

  it('calls stopScrollReRender when destroying an active sheet', () => {
    const pluginManager: any = {
      getAllPlugins: jest.fn(() => []),
      getPluginState: jest.fn(() => null),
      forEach: jest.fn(),
    };

    const renderEngine: any = {
      markDirty: jest.fn(),
      render: jest.fn(),
      scrollManager: {
        subscribeScroll: jest.fn(() => jest.fn()),
        destroy: jest.fn(),
        getShape: jest.fn(() => [10, 10]),
        setContentBoundary: jest.fn(),
      },
    };

    const core = new SearCoreSheet(
      { addPluginNode: jest.fn(), positionRectStorage: null } as any,
      pluginManager,
      {
        getDataType: jest.fn(() => null),
        readDataViewField: jest.fn(() => void 0),
        registerDataType: jest.fn(),
        enforceWriteBoundary: jest.fn(),
      } as any,
      renderEngine,
      {
        render: jest.fn(),
        renderHitOnNextFrame: jest.fn(),
        eventRegistrar: { registeredEvents: [] },
        registerEvent: jest.fn(),
        destroy: jest.fn(),
      } as any,
      {} as any,
      { start: jest.fn(), destroy: jest.fn() } as any,
      { apply: jest.fn() } as any,
      {
        get: jest.fn(() => void 0),
        register: jest.fn(),
      } as any,
    );

    const stop = jest.fn();
    renderEngine.scrollManager.subscribeScroll.mockReturnValue(stop);
    core.start();

    core.destroy();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(renderEngine.scrollManager.destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys cleanly when no scroll subscriber disposer is registered', () => {
    const pluginManager: any = {
      getAllPlugins: jest.fn(() => []),
      getPluginState: jest.fn(() => null),
      forEach: jest.fn(),
    };

    const renderEngine: any = {
      markDirty: jest.fn(),
      render: jest.fn(),
      scrollManager: {
        subscribeScroll: jest.fn(() => jest.fn()),
        destroy: jest.fn(),
        getShape: jest.fn(() => [10, 10]),
        setContentBoundary: jest.fn(),
      },
    };

    const core = new SearCoreSheet(
      { addPluginNode: jest.fn(), positionRectStorage: null } as any,
      pluginManager,
      {
        getDataType: jest.fn(() => null),
        readDataViewField: jest.fn(() => void 0),
        registerDataType: jest.fn(),
      } as any,
      renderEngine,
      {
        render: jest.fn(),
        renderHitOnNextFrame: jest.fn(),
        eventRegistrar: { registeredEvents: [] },
        registerEvent: jest.fn(),
        destroy: jest.fn(),
      } as any,
      {} as any,
      { start: jest.fn(), destroy: jest.fn() } as any,
      { apply: jest.fn() } as any,
      {
        get: jest.fn(() => void 0),
        register: jest.fn(),
      } as any,
    );

    expect(() => core.destroy()).not.toThrow();
    expect(renderEngine.scrollManager.destroy).toHaveBeenCalledTimes(1);
  });

  it('rolls back sheet data when a later pipeline step fails after a transaction', () => {
    const oldCell = { type: 'string', value: 'old' };
    const newCell = { type: 'string', value: 'new' };
    const sheetData = new SheetMatrix(void 0, [2, 2]);
    sheetData.addItem(0, 0, oldCell);
    const rowSizes = new RowShapeDimensionsCSRMatrix(void 0, [1, 2]);
    const columnSizes = new ColumnShapeDimensionsCSRMatrix(void 0, [1, 2]);
    rowSizes.setDefaultValue(24);
    columnSizes.setDefaultValue(80);
    const dataPlugin = new SheetDataPlugin({ sheetData });
    const dataEngine = new SheetDataEngine();
    registerSheetViewState(dataEngine, {
      sheetData,
      rowSizes,
      columnSizes,
      cellAlignments: new CSRMatrix<string>(void 0, [2, 2]),
    });
    const pluginManager: any = {
      getAllPlugins: jest.fn(() => []),
      getPluginState: jest.fn(() => null),
      forEach: jest.fn((callback: (plugin: any) => void) => callback(dataPlugin)),
    };
    const executors = new Map<string, { kind: string; execute: (context: any, step: any) => void }>();
    const stepExecutorRegistry: any = {
      get: jest.fn((kind) => executors.get(kind)),
      register: jest.fn((executor) => {
        executors.set(executor.kind, executor);
        return () => {};
      }),
    };
    executors.set('failing-step', {
      kind: 'failing-step',
      execute: () => {
        throw new Error('pipeline failed');
      },
    });
    const core = new SearCoreSheet(
      { addPluginNode: jest.fn(), positionRectStorage: null } as any,
      pluginManager,
      dataEngine,
      {
        markDirty: jest.fn(),
        render: jest.fn(),
        scrollManager: {
          subscribeScroll: jest.fn(() => jest.fn()),
          destroy: jest.fn(),
          getShape: jest.fn(() => [10, 10]),
          setContentBoundary: jest.fn(),
        },
      } as any,
      {
        render: jest.fn(),
        renderHitOnNextFrame: jest.fn(),
        eventRegistrar: { registeredEvents: [] },
        registerEvent: jest.fn(),
        destroy: jest.fn(),
      } as any,
      {} as any,
      { start: jest.fn(), destroy: jest.fn() } as any,
      { apply: jest.fn() } as any,
      stepExecutorRegistry,
    );
    const transaction = createTransaction(dataPlugin.key);
    transaction.addOperation([
      {
        p: [0, 0],
        [MatrixOTActionName.UpdateCell]: { value: newCell, prev: oldCell },
      },
    ]);
    const pipeline = new Pipeline('failed-after-transaction');
    pipeline.addTransaction('set-cell', transaction);
    pipeline.addCustom('fail', 'failing-step');

    expect(() => core.executePipeline(pipeline)).toThrow('pipeline failed');
    const restored = dataEngine.getDataType<{ sheetData: SheetMatrix }>(dataPlugin.key);

    expect(restored?.sheetData.getItem(0, 0)).toEqual(oldCell);
    expect(dataPlugin.getState().sheetData.getItem(0, 0)).toEqual(oldCell);
  });

  it('keeps sheet data unchanged when another transaction consumer fails during the same transaction', () => {
    const oldCell = { type: 'string', value: 'old' };
    const newCell = { type: 'string', value: 'new' };
    const sheetData = new SheetMatrix(void 0, [2, 2]);
    sheetData.addItem(0, 0, oldCell);
    const dataPlugin = new SheetDataPlugin({ sheetData });
    const observerKey = new PluginKey('throwing-observer');
    const throwingObserver = {
      key: observerKey,
      interestedIn: ['*'],
      apply: jest.fn(() => {
        throw new Error('observer failed');
      }),
      render: jest.fn(() => []),
      setState: jest.fn(),
    };
    const dataEngine = new SheetDataEngine();
    registerSheetViewState(dataEngine, {
      sheetData,
      rowSizes: new RowShapeDimensionsCSRMatrix(void 0, [1, 2]),
      columnSizes: new ColumnShapeDimensionsCSRMatrix(void 0, [1, 2]),
      cellAlignments: new CSRMatrix<string>(void 0, [2, 2]),
    });
    dataEngine.registerDataType(observerKey, {});
    const pluginManager: any = {
      getAllPlugins: jest.fn(() => []),
      getPluginState: jest.fn(() => null),
      forEach: jest.fn((callback: (plugin: any) => void) => {
        callback(dataPlugin);
        callback(throwingObserver);
      }),
    };
    const executors = new Map<string, { kind: string; execute: (context: any, step: any) => void }>();
    const stepExecutorRegistry: any = {
      get: jest.fn((kind) => executors.get(kind)),
      register: jest.fn((executor) => {
        executors.set(executor.kind, executor);
        return () => {};
      }),
    };
    const core = new SearCoreSheet(
      { addPluginNode: jest.fn(), positionRectStorage: null } as any,
      pluginManager,
      dataEngine,
      {
        markDirty: jest.fn(),
        render: jest.fn(),
        scrollManager: {
          subscribeScroll: jest.fn(() => jest.fn()),
          destroy: jest.fn(),
          getShape: jest.fn(() => [10, 10]),
          setContentBoundary: jest.fn(),
        },
      } as any,
      {
        render: jest.fn(),
        renderHitOnNextFrame: jest.fn(),
        eventRegistrar: { registeredEvents: [] },
        registerEvent: jest.fn(),
        destroy: jest.fn(),
      } as any,
      {} as any,
      { start: jest.fn(), destroy: jest.fn() } as any,
      { apply: jest.fn() } as any,
      stepExecutorRegistry,
    );
    const transaction = createTransaction(dataPlugin.key);
    transaction.addOperation([
      {
        p: [0, 0],
        [MatrixOTActionName.UpdateCell]: { value: newCell, prev: oldCell },
      },
    ]);

    expect(() => core.executePipeline(Pipeline.fromTransaction('failed-current-transaction', transaction))).toThrow(
      'observer failed',
    );
    const restored = dataEngine.getDataType<{ sheetData: SheetMatrix }>(dataPlugin.key);

    expect(restored?.sheetData.getItem(0, 0)).toEqual(oldCell);
    expect(dataPlugin.getState().sheetData.getItem(0, 0)).toEqual(oldCell);
    expect(throwingObserver.setState).not.toHaveBeenCalled();
  });

  it('keeps staged plugin state private when a later pipeline step fails', () => {
    const customKey = new PluginKey('custom-staging');
    const passiveKey = new PluginKey('passive-staging');
    const fallbackKey = new PluginKey('fallback-staging');
    const passiveClone = jest.fn(() => ({ value: 'passive-clone' }));
    const fallbackClone = jest.fn(() => ({ value: 'fallback-before' }));
    const customState = { value: 'custom-before' };
    const passiveState = { value: 'passive', clone: passiveClone };
    const fallbackState = { value: 'fallback-before', clone: fallbackClone };
    const customPlugin = {
      key: customKey,
      interestedIn: ['*'],
      apply: jest.fn(() => {
        customState.value = 'custom-after';
        return null;
      }),
      render: jest.fn(() => []),
    };
    const passivePlugin = {
      key: passiveKey,
      interestedIn: ['*'],
      apply: jest.fn(() => passiveState),
      render: jest.fn(() => []),
    };
    const fallbackPlugin = {
      key: fallbackKey,
      interestedIn: ['*'],
      apply: jest.fn((pluginState) => {
        pluginState.value = 'fallback-after';
        return pluginState;
      }),
      render: jest.fn(() => []),
      setState: jest.fn(),
    };
    const dataEngine = new SheetDataEngine();
    dataEngine.registerDataType(customKey, customState);
    dataEngine.registerDataType(passiveKey, passiveState);
    dataEngine.registerDataType(fallbackKey, fallbackState);
    const executors = new Map<string, { kind: string; execute: (context: any, step: any) => void }>();
    executors.set('failing-step', {
      kind: 'failing-step',
      execute: () => {
        throw new Error('after transaction failed');
      },
    });
    const core = createCoreWithPlugins([customPlugin, passivePlugin, fallbackPlugin], dataEngine, executors);
    const transaction = createTransaction(customKey);
    transaction.addOperation([{ p: [0], rr: { value: 2, prev: 1 } }] as any);
    const pipeline = new Pipeline('staging-strategy');
    pipeline.addTransaction('mutate', transaction);
    pipeline.addCustom('fail', 'failing-step');

    expect(() => core.executePipeline(pipeline)).toThrow('after transaction failed');

    expect(passiveClone).toHaveBeenCalled();
    expect(fallbackClone).toHaveBeenCalled();
    expect(fallbackPlugin.setState).not.toHaveBeenCalled();
    expect(dataEngine.getDataType(fallbackKey)).toMatchObject({ value: 'fallback-before' });
  });

  it('publishes post-commit actions only after staging succeeds and before render', () => {
    const executors = new Map<string, { kind: string; execute: (context: any, step: any) => void }>();
    executors.set('fail-after-scheduling', {
      kind: 'fail-after-scheduling',
      execute: () => { throw new Error('staging failed'); },
    });
    const core = createCoreWithPlugins([], new SheetDataEngine(), executors);
    const published = jest.fn();
    const failed = new Pipeline('failed-post-commit');
    failed.addPostCommit('publish', published);
    failed.addCustom('fail', 'fail-after-scheduling');

    expect(() => core.executePipeline(failed)).toThrow('staging failed');
    expect(published).not.toHaveBeenCalled();

    const render = jest.spyOn(core.getRenderEngine(), 'render');
    const successful = new Pipeline('successful-post-commit');
    successful.addPostCommit('publish', published);
    successful.addRender('refresh', new PluginKey('refresh'));
    core.executePipeline(successful);

    expect(published).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalled();
    expect(published.mock.invocationCallOrder[0]).toBeLessThan(render.mock.invocationCallOrder[0]);
  });

  it('rolls back prepared local resources when later staging fails', () => {
    const executors = new Map<string, { kind: string; execute: (context: any, step: any) => void }>();
    executors.set('fail-after-prepare', { kind: 'fail-after-prepare', execute: () => { throw new Error('staging failed'); } });
    const core = createCoreWithPlugins([], new SheetDataEngine(), executors);
    const events: string[] = [];
    const failed = new Pipeline('prepared-failure');
    failed.addPreparedAction('prepare', () => {
      events.push('prepare');
      return () => { events.push('rollback'); };
    });
    failed.addCustom('fail', 'fail-after-prepare');
    failed.addPostCommit('activate', () => { events.push('commit'); });

    expect(() => core.executePipeline(failed)).toThrow('staging failed');
    expect(events).toEqual(['prepare', 'rollback']);

    const successful = new Pipeline('prepared-success');
    successful.addPreparedAction('prepare', () => {
      events.push('prepare');
      return () => { events.push('rollback'); };
    });
    successful.addPostCommit('activate', () => { events.push('commit'); });
    core.executePipeline(successful);
    expect(events).toEqual(['prepare', 'rollback', 'prepare', 'commit']);
  });

  it('continues committed notifications after a post-commit callback fails', () => {
    const platform = {
      requestAnimationFrame: jest.fn(() => 1),
      cancelAnimationFrame: jest.fn(),
      warn: jest.fn(),
    };
    const committed = jest.fn();
    const plugin = { key: new PluginKey('observer'), interestedIn: [], onTransactionCommitted: committed };
    const core = createCoreWithPlugins([plugin], new SheetDataEngine(), new Map(), void 0, platform);
    const afterFailure = jest.fn();
    const pipeline = new Pipeline('post-commit-failure');
    pipeline.addTransaction('change', createTransaction(new PluginKey('unrelated')));
    pipeline.addPostCommit('fail', () => { throw new Error('callback failed'); });
    pipeline.addPostCommit('continue', afterFailure);

    expect(() => core.executePipeline(pipeline)).not.toThrow();
    expect(afterFailure).toHaveBeenCalledTimes(1);
    expect(committed).toHaveBeenCalledTimes(1);
    expect(platform.warn).toHaveBeenCalledWith(
      expect.stringContaining('post-commit action failed'),
      expect.any(Error),
    );
  });

  it('notifies plugins of committed transactions before rendering their derived state', () => {
    const key = new PluginKey('committed-view');
    let derived = 'old';
    const render = jest.fn(() => {
      expect(derived).toBe('new');
      return [];
    });
    const plugin = {
      key,
      interestedIn: [],
      getState: () => null,
      apply: () => null,
      onTransactionCommitted: () => { derived = 'new'; },
      render,
    };
    const core = createCoreWithPlugins([plugin], new SheetDataEngine());
    const pipeline = new Pipeline('committed-view');
    pipeline.addTransaction('commit', createTransaction(key));
    pipeline.addRender('refresh', key);

    core.executePipeline(pipeline);

    expect(render).toHaveBeenCalledTimes(1);
  });

  it('keeps Map and Set plugin state unchanged when staged execution fails', () => {
    const pluginKey = new PluginKey('map-set-staging');
    const state = {
      values: new Map<unknown, unknown>([[{ row: 1 }, { value: 'before' }]]),
      selected: new Set<unknown>([{ row: 2 }]),
    };
    const plugin = {
      key: pluginKey,
      apply: jest.fn((pluginState) => {
        pluginState.values.clear();
        pluginState.selected.clear();
        return pluginState;
      }),
      render: jest.fn(() => []),
      setState: jest.fn(),
    };
    const dataEngine = new SheetDataEngine();
    dataEngine.registerDataType(pluginKey, state);
    const executors = new Map<string, { kind: string; execute: (context: any, step: any) => void }>();
    executors.set('failing-step', {
      kind: 'failing-step',
      execute: () => {
        throw new Error('map set staging failed');
      },
    });
    const core = createCoreWithPlugins([plugin], dataEngine, executors);
    const pipeline = new Pipeline('map-set-staging');
    pipeline.addTransaction('mutate', createTransaction(pluginKey));
    pipeline.addCustom('fail', 'failing-step');

    expect(() => core.executePipeline(pipeline)).toThrow('map set staging failed');

    const restored = dataEngine.getDataType<typeof state>(pluginKey);
    expect(restored?.values.size).toBe(1);
    expect(restored?.selected.size).toBe(1);
    expect(restored?.values).toBe(state.values);
    expect(restored?.selected).toBe(state.selected);
  });

  it('does not replace state when staged execution fails', () => {
    const pluginKey = new PluginKey('custom-state-staging');
    const originalState = { value: 'before' };
    const replacementState = { value: 'replacement' };
    const plugin = {
      key: pluginKey,
      apply: jest.fn(() => originalState),
      render: jest.fn(() => []),
      setState: jest.fn(),
    };
    const dataEngine = new SheetDataEngine();
    dataEngine.registerDataType(pluginKey, originalState);
    const executors = new Map<string, { kind: string; execute: (context: any, step: any) => void }>();
    executors.set('failing-step', {
      kind: 'failing-step',
      execute: () => {
        throw new Error('replacement staging failed');
      },
    });
    const core = createCoreWithPlugins([plugin], dataEngine, executors);
    const pipeline = new Pipeline('custom-state-staging');
    pipeline.addTransaction('mutate', createTransaction(pluginKey));
    pipeline.addCustom('fail', 'failing-step');

    expect(() => core.executePipeline(pipeline)).toThrow('replacement staging failed');
    expect(plugin.setState).not.toHaveBeenCalled();
    expect(dataEngine.getDataType(pluginKey)).toBe(originalState);
  });

  it('staged cloning snapshots accessor objects and skips missing descriptors defensively', () => {
    const pluginKey = new PluginKey('accessor-staging');
    const state = {
      get value() {
        return 'before';
      },
    };
    const plugin = {
      key: pluginKey,
      apply: jest.fn(() => state),
      render: jest.fn(() => []),
      setState: jest.fn(),
    };
    const dataEngine = new SheetDataEngine();
    dataEngine.registerDataType(pluginKey, state);
    const executors = new Map<string, { kind: string; execute: (context: any, step: any) => void }>();
    executors.set('failing-step', {
      kind: 'failing-step',
      execute: () => {
        throw new Error('accessor staging failed');
      },
    });
    const core = createCoreWithPlugins([plugin], dataEngine, executors);
    const missingDescriptorProxy = new Proxy(
      {},
      {
        ownKeys: () => ['ghost'],
        getOwnPropertyDescriptor: () => void 0,
      },
    );

    expect((core as any).cloneStagedState(missingDescriptorProxy)).toEqual({});

    const pipeline = new Pipeline('accessor-staging');
    pipeline.addTransaction('mutate', createTransaction(pluginKey));
    pipeline.addCustom('fail', 'failing-step');

    expect(() => core.executePipeline(pipeline)).toThrow('accessor staging failed');
    expect((dataEngine.getDataType(pluginKey) as typeof state).value).toBe('before');
  });

  it('covers staged-state reuse, private plugin state, and empty built-in steps', () => {
    const sharedKey = new PluginKey('shared-staged-state');
    const privateKey = new PluginKey('private-staged-state');
    const dataEngine = new SheetDataEngine();
    Object.defineProperty(dataEngine, 'hasDataType', { value: void 0 });
    dataEngine.registerDataType(sharedKey, { value: 0 });
    const sharedPlugin = {
      key: sharedKey,
      interestedIn: [],
      apply: jest.fn((state: { value: number }) => ({ value: state.value + 1 })),
      setState: jest.fn(),
    };
    const privatePlugin = {
      key: privateKey,
      interestedIn: [],
      getState: jest.fn(() => ({ value: 10 })),
      apply: jest.fn((state: { value: number }) => ({ value: state.value + 1 })),
      setState: jest.fn(),
    };
    const interactionStore = {
      getState: jest.fn(() => ({ revision: 0 })),
      reduce: jest.fn((state: { revision: number }) => ({ revision: state.revision + 1 })),
      commit: jest.fn(),
    };
    const executors = new Map<string, { kind: string; execute: (context: any, step: any) => void }>();
    executors.set('empty-built-ins', {
      kind: 'empty-built-ins',
      execute: (context) => {
        context.executeTransaction({});
        context.renderPlugin({});
        context.applyInteraction({});
      },
    });
    const core = createCoreWithPlugins([sharedPlugin, privatePlugin], dataEngine, executors, interactionStore);
    const sharedTransaction = createTransaction(sharedKey);
    const privateTransaction = createTransaction(privateKey);
    const pipeline = new Pipeline('staged-branches');
    pipeline.addCustom('empty-built-ins', 'empty-built-ins');
    pipeline.addTransaction('first-shared-change', sharedTransaction);
    pipeline.addTransaction('second-shared-change', sharedTransaction);
    pipeline.addTransaction('private-change', privateTransaction);
    pipeline.addInteraction('first-interaction', { type: 'first' });
    pipeline.addInteraction('second-interaction', { type: 'second' });

    core.executePipeline(pipeline);

    expect(sharedPlugin.setState).toHaveBeenCalledWith({ value: 2 }, expect.any(Object));
    expect(dataEngine.getDataType(sharedKey)).toEqual({ value: 2 });
    expect(privatePlugin.setState).toHaveBeenCalledWith({ value: 11 }, expect.any(Object));
    expect(interactionStore.reduce).toHaveBeenNthCalledWith(1, { revision: 0 }, { type: 'first' });
    expect(interactionStore.reduce).toHaveBeenNthCalledWith(2, { revision: 1 }, { type: 'second' });
  });
});

 describe('owner transaction prerequisites',()=>{
  it('retains projected operations in the pipeline and rolls all staged owners back on failure',()=>{
    const rootKey=new PluginKey('root-projection-test'),key=new PluginKey('prerequisite-owner');
    const dataEngine=new SheetDataEngine();dataEngine.registerDataType(key,{value:'before'});
    const plugin={key,getState:()=>dataEngine.getDataType<{value:string}>(key),projectTransaction:jest.fn(()=>[createTransaction(key,[{p:[0,0],uc:{value:'after',prev:'before'}}] as any)]),apply:(state:{value:string},transaction:Transaction)=>{if(transaction.pluginKey!==key)return null;state.value='after';return state;},render:()=>[],setState:jest.fn()};
    const executors=new Map<string,{kind:string;execute:(context:any,step:any)=>void}>();executors.set('fail-projection',{kind:'fail-projection',execute:()=>{throw new Error('projection rollback');}});
    const core=createCoreWithPlugins([plugin],dataEngine,executors),pipeline=new Pipeline('projection-rollback');pipeline.addTransaction('root',createTransaction(rootKey,[{p:[0,0],uc:{value:'root',prev:null}}] as any));pipeline.addCustom('fail','fail-projection');
    expect(()=>core.executePipeline(pipeline)).toThrow('projection rollback');expect(dataEngine.getDataType(key)).toEqual({value:'before'});expect(plugin.setState).not.toHaveBeenCalled();expect(plugin.projectTransaction).toHaveBeenCalledTimes(1);expect(pipeline.steps.filter(step=>step.transaction).map(step=>step.transaction!.pluginKey)).toEqual([key,rootKey]);
  });
 });
