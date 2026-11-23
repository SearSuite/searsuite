import { MatrixOTActionName } from '@searsuite/sear-domain-ot';
import { SheetGridPlugin } from '../src/sheet/SheetGrid';

describe('SheetGridPlugin', () => {
  it('aggregates grid state/configuration, delegates double click, and composes render layers', () => {
    const corner = {
      registerState: jest.fn(() => ({ key: 'corner', state: {} })),
      registerConfig: jest.fn(() => [{ key: 'corner' }]),
      getPluginConfig: jest.fn(() => ({ width: 50, height: 24 })),
      render: jest.fn(() => [{ id: 'corner' }]),
    };
    const columns = { registerConfig: jest.fn(() => [{ key: 'columns' }]), render: jest.fn(() => [{ id: 'columns' }]) };
    const rows = { registerConfig: jest.fn(() => [{ key: 'rows' }]), render: jest.fn(() => [{ id: 'rows' }]) };
    const gridRender = {
      registerConfig: jest.fn(() => [{ key: 'grid' }]),
      render: jest.fn(() => ({ id: 'grid' })),
      onDblClick: jest.fn(),
    };
    const plugin = new SheetGridPlugin(corner as never, columns as never, rows as never, gridRender as never);
    const core = {};

    expect(plugin.registerState()).toEqual({ key: plugin.key, state: {} });
    expect(plugin.registerConfig()).toEqual([{ key: 'corner' }, { key: 'columns' }, { key: 'rows' }, { key: 'grid' }]);
    expect(plugin.render(core as never)).toEqual([{ id: 'corner' }, { id: 'columns' }, { id: 'rows' }, { id: 'grid' }]);
    expect(columns.render).toHaveBeenCalledWith(core, { x: 50, y: 0 });
    expect(rows.render).toHaveBeenCalledWith(core, { x: 0, y: 24 });
    expect(gridRender.render).toHaveBeenCalledWith(core, { x: 50, y: 24 });

    plugin.onDblClick(core as never, { type: 'dblclick' } as never);
    expect(gridRender.onDblClick).toHaveBeenCalled();
  });

  it('renders the grid layer without asking the independent merge owner to render twice', () => {
    const corner = { getPluginConfig: () => ({ width: 0, height: 0 }), render: () => [] };
    const columns = { render: () => [] };
    const rows = { render: () => [] };

    const gridRender = { render: () => ({ id: 'grid-single' }) };
    const plugin = new SheetGridPlugin(corner as never, columns as never, rows as never, gridRender as never);
    expect(plugin.render({} as never)).toEqual([{ id: 'grid-single' }]);

    const gridRender2 = { render: () => [{ id: 'grid-arr' }] };
    const plugin2 = new SheetGridPlugin(corner as never, columns as never, rows as never, gridRender2 as never);
    expect(plugin2.render({} as never)).toEqual([{ id: 'grid-arr' }]);
  });

  it('filters unrelated transactions and rejects direct configuration lookup', () => {
    const plugin = new SheetGridPlugin({} as never, {} as never, {} as never, {} as never);
    const state = {};

    expect(
      plugin.apply(state, {
        pluginKey: plugin.key,
        operations: [{ p: [0, 0], [MatrixOTActionName.UpdateCell]: { value: null, prev: null } }],
      } as never),
    ).toBe(state);
    expect(plugin.apply(state, { pluginKey: plugin.key, operations: [{ p: [0] }] } as never)).toBeNull();
    expect(plugin.getPluginConfig({} as never)).toBeNull();
  });

  it('accepts resize transactions owned by the dimension plugin for geometry refresh', () => {
    const plugin = new SheetGridPlugin({} as never, {} as never, {} as never, {} as never);
    const state = {};

    expect(
      plugin.apply(state, {
        pluginKey: { key: 'SheetResize$' },
        operations: [{ p: [0], [MatrixOTActionName.ResizeRow]: { value: 36, prev: 24 } }],
      } as never),
    ).toBe(state);
    expect(plugin.interestedIn).toContain(MatrixOTActionName.ResizeRow);
    expect(plugin.interestedIn).toContain(MatrixOTActionName.ResizeCol);
  });
});
