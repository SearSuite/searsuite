import { type SubscriptionManager } from '@searsuite/sear-foundation-subscription';
import { SheetViewportResizeController } from '../src/SheetViewportResizeController';
import { type SheetLifecycleContext } from '../src/SheetLifecycleController';

describe('SheetViewportResizeController', () => {
  it('performs a complete initial viewport refresh even when dimensions are unchanged', () => {
    const stopObserving = jest.fn();
    const subscriptionManager = {
      observeResize: jest.fn(() => stopObserving),
    } as unknown as SubscriptionManager;
    const stage = { addPluginNode: jest.fn() };
    const plugin = { key: { key: 'grid' }, render: jest.fn(() => []) };
    const core = {
      renderEngine: {
        renderContext: { getRenderTarget: jest.fn(() => ({})) },
        scrollManager: {
          getShape: jest.fn(() => [100, 80]),
          resize: jest.fn(),
        },
        resize: jest.fn(),
        render: jest.fn(),
      },
      configEngine: { getDefaultConfig: () => ({ devicePixelRatio: 2 }) },
      getViewExtensions: () => ({
        forEach: (callback: (value: typeof plugin) => void) => callback(plugin),
      }),
      eventEngine: { renderImmediate: jest.fn() },
      getStage: jest.fn(() => stage),
    };
    const refreshSheetBoundaries = jest.fn();
    const controller = new SheetViewportResizeController(subscriptionManager);

    controller.start({
      core,
      refreshSheetBoundaries,
    } as unknown as SheetLifecycleContext);

    expect(core.renderEngine.resize).toHaveBeenCalledWith(100, 80, 2);
    expect(core.renderEngine.scrollManager.resize).toHaveBeenCalledWith(100, 80);
    expect(refreshSheetBoundaries).toHaveBeenCalledTimes(1);
    expect(plugin.render).toHaveBeenCalledWith(core);
    expect(core.eventEngine.renderImmediate).toHaveBeenCalledWith(stage);
  });

  it('skips invalid and unchanged resize notifications, refreshes changed dimensions, and releases observer state', () => {
    let notify: ((size: { width: number; height: number }) => void) | undefined;
    const stopObserving = jest.fn();
    const subscriptionManager = {
      observeResize: jest.fn((_target, callback) => {
        notify = callback;
        return stopObserving;
      }),
    } as unknown as SubscriptionManager;
    const stage = { addPluginNode: jest.fn() };
    const rendered = { key: { key: 'rendered' }, onResize: jest.fn(), render: jest.fn(() => []) };
    const nonRendered = { key: { key: 'no-render' }, onResize: jest.fn() };
    const core = {
      renderEngine: {
        renderContext: { getRenderTarget: jest.fn(() => ({})) },
        scrollManager: { getShape: jest.fn(() => [100, 80]), resize: jest.fn() },
        resize: jest.fn(),
        render: jest.fn(),
      },
      configEngine: { getDefaultConfig: () => ({ devicePixelRatio: 1 }) },
      getViewExtensions: () => ({
        forEach: (callback: (plugin: typeof rendered | typeof nonRendered) => void) => {
          callback(rendered);
          callback(nonRendered);
        },
      }),
      eventEngine: { renderImmediate: jest.fn() },
      getStage: jest.fn(() => stage),
    };
    const refreshSheetBoundaries = jest.fn();
    const controller = new SheetViewportResizeController(subscriptionManager);

    controller.start({ core, refreshSheetBoundaries } as unknown as SheetLifecycleContext);
    controller.start({ core, refreshSheetBoundaries } as unknown as SheetLifecycleContext);
    notify?.({ width: 0, height: 80 });
    notify?.({ width: 100, height: 80 });
    notify?.({ width: 120, height: 90 });

    expect(subscriptionManager.observeResize).toHaveBeenCalledTimes(1);
    expect(core.renderEngine.resize).toHaveBeenLastCalledWith(120, 90, 1);
    expect(rendered.onResize).toHaveBeenCalledTimes(2);
    expect(nonRendered.onResize).toHaveBeenCalledTimes(2);
    expect(stage.addPluginNode).toHaveBeenCalledWith('rendered', []);
    expect(stage.addPluginNode).not.toHaveBeenCalledWith('no-render', expect.anything());
    controller.destroy();
    controller.destroy();
    expect(stopObserving).toHaveBeenCalledTimes(1);
  });
});
