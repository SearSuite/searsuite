import { MatrixOTActionName } from '@searsuite/sear-domain-ot';
import { SheetGridView } from '../src/sheet/SheetGrid';

describe('SheetGridView', () => {
  it('aggregates grid state/configuration, delegates double click, and composes render layers', () => {
    const corner = {
      registerState: jest.fn(() => ({ key: 'corner', state: {} })),
      registerConfig: jest.fn(() => [{ key: 'corner' }]),
      getConfig: jest.fn(() => ({ width: 50, height: 24 })),
      render: jest.fn(() => [{ id: 'corner' }]),
    };
    const columns = { registerConfig: jest.fn(() => [{ key: 'columns' }]), render: jest.fn(() => [{ id: 'columns' }]) };
    const rows = { registerConfig: jest.fn(() => [{ key: 'rows' }]), render: jest.fn(() => [{ id: 'rows' }]) };
    const gridRender = {
      registerConfig: jest.fn(() => [{ key: 'grid' }]),
      render: jest.fn(() => ({ id: 'grid' })),
      onDblClick: jest.fn(),
    };
    const plugin = new SheetGridView(corner as never, columns as never, rows as never, gridRender as never);
    const core = {};

    expect(plugin.registerConfig()).toEqual([{ key: 'corner' }, { key: 'columns' }, { key: 'rows' }, { key: 'grid' }]);
    expect(plugin.render(core as never)).toEqual([{ id: 'corner' }, { id: 'columns' }, { id: 'rows' }, { id: 'grid' }]);
    expect(columns.render).toHaveBeenCalledWith(core, { x: 50, y: 0 });
    expect(rows.render).toHaveBeenCalledWith(core, { x: 0, y: 24 });
    expect(gridRender.render).toHaveBeenCalledWith(core, { x: 50, y: 24 });

    plugin.onDblClick(core as never, { type: 'dblclick' } as never);
    expect(gridRender.onDblClick).toHaveBeenCalled();
  });

  it('renders the grid layer without asking the independent merge owner to render twice', () => {
    const corner = { getConfig: () => ({ width: 0, height: 0 }), render: () => [] };
    const columns = { render: () => [] };
    const rows = { render: () => [] };

    const gridRender = { render: () => ({ id: 'grid-single' }) };
    const plugin = new SheetGridView(corner as never, columns as never, rows as never, gridRender as never);
    expect(plugin.render({} as never)).toEqual([{ id: 'grid-single' }]);

    const gridRender2 = { render: () => [{ id: 'grid-arr' }] };
    const plugin2 = new SheetGridView(corner as never, columns as never, rows as never, gridRender2 as never);
    expect(plugin2.render({} as never)).toEqual([{ id: 'grid-arr' }]);
  });
});
