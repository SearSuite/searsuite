import { ScrollManager } from '@searsuite/sear-render-scroll';
import { ConfigEngine, defaultSheetConfig } from '@searsuite/sear-assembly-config';
import {
  PluginKey,
  PluginManager,
  Pipeline,
  PipelineStepExecutorRegistry,
  SheetInteractionStore,
  SheetInteractionReducerRegistry,
} from '@searsuite/sear-assembly-plugin';
import { SheetKernel, SheetOwnerLifecycle } from '@searsuite/sear-assembly-sheet-kernel';
import { SheetDataEngine, SheetMatrix } from '@searsuite/sear-domain-sheet';
import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { SheetResizePlugin } from '@searsuite/sear-plugin-resize';
import { ColumnShapeDimensionsCSRMatrix, CSRMatrix, RowShapeDimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import { NodePlatform } from '@searsuite/sear-node-adapters';
import { createTransaction } from '@searsuite/sear-domain-transaction';
import { ViewExtensionRegistry, ViewExtensionRole, type ViewExtension } from '@searsuite/sear-render-event-engine';
import { type CellProperties } from '@searsuite/sear-render-registry';
import { SearCoreSheet } from '../src';

function fixture() {
  const platform = new NodePlatform(),
    frames: FrameRequestCallback[] = [];
  jest.spyOn(platform, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  jest.spyOn(platform, 'cancelAnimationFrame').mockImplementation(() => {});
  const manager = new PluginManager(platform),
    data = new SheetDataEngine(),
    config = new ConfigEngine(defaultSheetConfig);
  const rows = new RowShapeDimensionsCSRMatrix(undefined, [1, 1_048_576]);
  rows.setDefaultValue(24);
  const columns = new ColumnShapeDimensionsCSRMatrix(undefined, [1, 16_384]);
  columns.setDefaultValue(100);
  const owner = new SheetDataPlugin({ sheetData: new SheetMatrix(undefined, [1_048_576, 16_384]) });
  manager.registerPlugin(owner);
  manager.registerPlugin(
    new SheetResizePlugin({
      rowSizes: rows,
      columnSizes: columns,
      rowHiddenOriginalSizes: new CSRMatrix(undefined, [1, 1_048_576]),
      columnHiddenOriginalSizes: new CSRMatrix(undefined, [1, 16_384]),
    }),
  );
  const kernel = new SheetKernel(
    manager,
    data,
    config,
    new SheetInteractionStore(new SheetInteractionReducerRegistry(), platform),
    new PipelineStepExecutorRegistry(),
    platform,
    new SheetOwnerLifecycle(),
  );
  const stage = { addPluginNode: jest.fn(), positionRectStorage: null };
  const render = {
    render: jest.fn(),
    invalidateScreenCache: jest.fn(),
    scrollManager: {
      subscribeScroll: jest.fn((_listener: (state: unknown) => void, _prepend?: boolean) => jest.fn()),
      destroy: jest.fn(),
      getShape: () => [800, 600],
      hasUnrenderedScroll: jest.fn(() => true),
      setContentBoundary: jest.fn(),
    },
  };
  const events = {
    render: jest.fn(),
    renderImmediate: jest.fn(),
    renderHitOnNextFrame: jest.fn(),
    eventRegistrar: { registeredEvents: ['mousedown'] },
    registerEvent: jest.fn((_name: string, _listener: (event: unknown) => unknown) => {}),
    destroy: jest.fn(),
  };
  const lifecycle = { start: jest.fn(), destroy: jest.fn() };
  const views = new ViewExtensionRegistry<SearCoreSheet, CellProperties>();
  jest.spyOn(platform, 'warn').mockImplementation(() => {});
  const core = new SearCoreSheet(
    stage as never,
    kernel,
    render as never,
    events as never,
    lifecycle as never,
    platform,
    views,
  );
  const view: ViewExtension<SearCoreSheet, CellProperties> = {
    [ViewExtensionRole]: true,
    key: owner.key,
    render: jest.fn(() => []),
    onCommit: jest.fn(),
  };
  views.register(view);
  return {
    core,
    kernel,
    owner,
    manager,
    data,
    config,
    platform,
    frames,
    stage,
    render,
    events,
    lifecycle,
    views,
    view,
  };
}
function scroll(f: ReturnType<typeof fixture>): void {
  const listener = f.render.scrollManager.subscribeScroll.mock.calls[0]![0] as unknown as (state: unknown) => void;
  listener({ x: 0, y: 100, deltaX: 0, deltaY: 100 });
}

describe('SearCoreSheet as a visual kernel subscriber', () => {
  it('initializes business state before the view and starts presentation once', () => {
    const f = fixture();
    f.view.initializeView = (core) => {
      expect(core.getPlugin(f.owner.key)).toBeDefined();
    };
    f.core.start();
    f.core.start();
    f.core.initialize();
    expect(f.view.render).toHaveBeenCalledTimes(1);
    expect(f.events.render).toHaveBeenCalledTimes(1);
    expect(f.lifecycle.start).toHaveBeenCalledTimes(1);
    expect(f.core.getDataEngine()).toBe(f.data);
    expect(f.core.getRenderEngine()).toBe(f.render);
  });
  it('keeps committed business state after presentation fails', () => {
    const f = fixture();
    jest.spyOn(f.platform, 'warn').mockImplementation(() => {});
    f.core.initialize();
    jest.mocked(f.view.render!).mockImplementation(() => {
      throw new Error('view failed');
    });
    const cell = { type: 'string', value: 'committed' };
    const tx = createTransaction(f.owner.key, [{ p: [0, 0], uc: { value: cell, prev: null } }]);
    f.core.executePipeline(Pipeline.fromTransaction('cell', tx));
    expect(f.owner.getState().sheetData.getItem(0, 0)).toEqual(cell);
    expect(f.core.getCommitSnapshot().revision).toBe(1);
    expect(f.platform.warn).toHaveBeenCalled();
  });
  it('rebuilds visual output from committed state after an invalidation', () => {
    const f = fixture();
    f.core.initialize();
    jest.mocked(f.view.render!).mockClear();
    f.core.requestRender(f.view);
    expect(f.view.onCommit).not.toHaveBeenCalled();
    expect(f.kernel.getCommitSnapshot().revision).toBe(0);
    expect(f.stage.addPluginNode).toHaveBeenLastCalledWith(f.owner.key.key, []);
    expect(f.view.render).toHaveBeenCalledTimes(1);
  });
  it('does not repaint an empty pipeline', () => {
    const f = fixture();
    f.core.initialize();
    f.render.render.mockClear();
    f.core.executePipeline(new Pipeline('empty'));
    expect(f.render.render).not.toHaveBeenCalled();
  });
  it('routes native events only through view extensions and preserves propagation', () => {
    const f = fixture(),
      onMouseDown = jest.fn(() => false);
    Object.assign(f.view, { onMouseDown });
    f.core.initialize();
    const listener = f.events.registerEvent.mock.calls[0]![1] as unknown as (event: unknown) => boolean;
    const event = { type: 'mousedown' };
    expect(listener(event)).toBe(false);
    expect(onMouseDown).toHaveBeenCalledWith(f.core, event);
  });
  it('lets an input controller consume a gesture before selection regardless of drawing depth', () => {
    const f = fixture();
    const controller = {
      [ViewExtensionRole]: true as const,
      key: new PluginKey('input-controller'),
      depth: 100,
      render: jest.fn(() => []),
      onMouseDown: jest.fn(() => false),
    };
    const selection = {
      [ViewExtensionRole]: true as const,
      key: new PluginKey('selection-view'),
      depth: -1,
      render: jest.fn(() => []),
      onMouseDown: jest.fn(),
    };
    f.views.register(controller);
    f.views.register(selection);
    f.core.initialize();
    for (const [, handler] of f.events.registerEvent.mock.calls) {
      if (handler({ type: 'mousedown' }) === false) break;
    }
    expect(controller.onMouseDown).toHaveBeenCalledTimes(1);
    expect(selection.onMouseDown).not.toHaveBeenCalled();
    expect(f.stage.addPluginNode).toHaveBeenNthCalledWith(1, selection.key.key, []);
    expect(f.stage.addPluginNode).toHaveBeenLastCalledWith(controller.key.key, []);
  });
  it('coalesces multiple scroll updates into one frame', () => {
    const f = fixture();
    f.core.start();
    f.render.render.mockClear();
    scroll(f);
    scroll(f);
    expect(f.frames).toHaveLength(1);
    expect(f.render.render).not.toHaveBeenCalled();
    f.frames[0]!(0);
    expect(f.render.render).toHaveBeenCalledTimes(1);
    expect(f.events.renderHitOnNextFrame).toHaveBeenCalledTimes(1);
    expect(f.platform.warn).not.toHaveBeenCalled();
    expect(f.stage.addPluginNode).toHaveBeenLastCalledWith(f.owner.key.key, [], { markDirty: false });
  });
  it('repaints regenerated cells when another command has consumed the scroll delta', () => {
    const f = fixture();
    f.core.start();
    f.render.scrollManager.hasUnrenderedScroll.mockReturnValue(false);
    scroll(f);
    f.frames[0]!(0);
    expect(f.render.invalidateScreenCache).toHaveBeenCalledTimes(1);
  });
  it('reserves header space when computing maximum-sheet scroll boundaries', () => {
    const f = fixture();
    f.core.initialize();
    expect(f.render.scrollManager.setContentBoundary).toHaveBeenCalledWith(
      1_638_400 - (800 - 50),
      25_165_824 - (600 - 24),
    );
  });
  it('refreshes a changed viewport through the real scene subscriber', () => {
    const f = fixture();
    f.core.initialize();
    f.core.refreshViewport();
    expect(f.render.invalidateScreenCache).toHaveBeenCalled();
    expect(f.events.renderImmediate).toHaveBeenCalled();
  });
  it('locks owner references and delegates command authority to the kernel', () => {
    const f = fixture();
    f.core.initialize();
    f.core.enforceCommandBoundary(() => false);
    expect(() => Object.assign(f.core, { pluginManager: new PluginManager() })).toThrow();
    expect(() => f.core.executePipeline(new Pipeline('write').addLocalAction('write', () => {}))).toThrow(
      'editor.commands.run',
    );
  });
  it('cancels pending scroll work and ignores late callbacks after destroy', () => {
    const f = fixture();
    f.core.start();
    f.render.render.mockClear();
    scroll(f);
    f.core.destroy();
    f.core.destroy();
    f.frames[0]!(0);
    expect(f.platform.cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(f.render.render).not.toHaveBeenCalled();
    expect(f.events.destroy).toHaveBeenCalledTimes(1);
    expect(f.lifecycle.destroy).toHaveBeenCalledTimes(1);
    expect(f.render.scrollManager.destroy).toHaveBeenCalledTimes(1);
  });
  it('detaches the view subscription and reserves destruction for its editor', () => {
    const f = fixture();
    f.core.initialize();
    const token = {};
    Object.setPrototypeOf(f.render.scrollManager, ScrollManager.prototype);
    const scrollManager = new ScrollManager(800, 600);
    Object.assign(f.render, { scrollManager });
    f.core.enforceTeardownBoundary(token);
    expect(() => f.core.destroy()).toThrow('editor owner');
    f.core.destroy(token);
    jest.mocked(f.view.render!).mockClear();
    expect(() => f.kernel.executePipeline(Pipeline.fromInvalidation('detached', new PluginKey('view')))).toThrow(
      'destroyed',
    );
    expect(f.view.render).not.toHaveBeenCalled();
  });
});
