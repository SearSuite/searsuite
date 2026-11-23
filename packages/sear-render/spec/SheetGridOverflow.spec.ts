import { SheetGridOverflowPlugin } from '../src/sheet/SheetGridOverflow';

describe('SheetGridOverflowPlugin', () => {
  it('keeps placeholder state and config inert until overflow rendering exists', () => {
    const plugin = new SheetGridOverflowPlugin();

    expect(plugin.apply(null, { operations: [] } as never)).toBeNull();
    expect(plugin.registerState()).toEqual({ key: plugin.key, state: plugin.getState() });
    expect(plugin.getPluginConfig({} as never)).toBeNull();
    expect(plugin.render({} as never)).toEqual([]);
  });
});
