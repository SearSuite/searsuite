import { SheetCornerPlugin } from '../src/sheet/corner/SheetCornerPlugin';

describe('SheetCornerPlugin', () => {
  it('renders the corner with configured geometry and colors', () => {
    const plugin = new SheetCornerPlugin();
    const create = jest.fn(() => ({ render: () => ({ id: 'corner' }) }));
    const config = { width: 50, height: 24, backgroundColor: 'background', borderColor: 'border' };
    const core = {
      configEngine: { getPluginConfig: jest.fn(() => config) },
      renderEngine: { renderCoordinatorManager: { create } },
    };

    expect(plugin.render(core as never, { x: 2, y: 3 })).toEqual([{ id: 'corner' }]);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ type: expect.any(Symbol) }),
      { x: 2, y: 3, width: 50, height: 24 },
      expect.objectContaining({ fill: 'background', stroke: 'border', left: 0, top: 0 }),
    );
    expect(plugin.getPluginConfig(core as never)).toBe(config);
    expect(plugin.registerConfig()[0]?.config).toMatchObject({ width: 50, height: 24 });
  });

  it('returns no node when its coordinator declines rendering', () => {
    const plugin = new SheetCornerPlugin();
    const core = {
      configEngine: {
        getPluginConfig: () => ({
          width: 50,
          height: 24,
          backgroundColor: 'background',
          borderColor: 'border',
        }),
      },
      renderEngine: { renderCoordinatorManager: { create: () => void 0 } },
    };

    expect(plugin.render(core as never)).toEqual([]);
    expect(plugin.apply([] as never)).toBe(plugin.getState());
    expect(plugin.registerState()).toEqual({ key: plugin.key, state: plugin.getState() });
  });

  it('provides no-op lifecycle hooks', () => {
    const plugin = new SheetCornerPlugin();
    expect(plugin.initialize()).toBeUndefined();
    expect(plugin.onScroll({} as never)).toBeUndefined();
    expect(plugin.onResize()).toBeUndefined();
  });
});
