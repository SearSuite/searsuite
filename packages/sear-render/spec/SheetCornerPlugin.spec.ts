import { SheetCornerView } from '../src/sheet/corner/SheetCornerView';

describe('SheetCornerView', () => {
  it('renders the corner with configured geometry and colors', () => {
    const plugin = new SheetCornerView();
    const create = jest.fn(() => ({ render: () => ({ id: 'corner' }) }));
    const config = { width: 50, height: 24, backgroundColor: 'background', borderColor: 'border' };
    const core = {
      configEngine: { getConfig: jest.fn(() => config) },
      renderEngine: { renderCoordinatorManager: { create } },
    };

    expect(plugin.render(core as never, { x: 2, y: 3 })).toEqual([{ id: 'corner' }]);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ type: expect.any(Symbol) }),
      { x: 2, y: 3, width: 50, height: 24 },
      expect.objectContaining({ fill: 'background', stroke: 'border', left: 0, top: 0 }),
    );
    expect(plugin.getConfig(core as never)).toBe(config);
    expect(plugin.registerConfig()[0]?.config).toMatchObject({ width: 50, height: 24 });
  });

  it('returns no node when its coordinator declines rendering', () => {
    const plugin = new SheetCornerView();
    const core = {
      configEngine: {
        getConfig: () => ({
          width: 50,
          height: 24,
          backgroundColor: 'background',
          borderColor: 'border',
        }),
      },
      renderEngine: { renderCoordinatorManager: { create: () => void 0 } },
    };

    expect(plugin.render(core as never)).toEqual([]);
  });

  it('provides no-op lifecycle hooks', () => {
    const plugin = new SheetCornerView();
    expect(plugin.initialize()).toBeUndefined();
    expect(plugin.onScroll({} as never)).toBeUndefined();
    expect(plugin.onResize()).toBeUndefined();
  });
});
