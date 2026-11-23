import { SheetDataPlugin, SheetDataFieldNamespace, SheetDataMatrixFieldKey } from '@searsuite/sear-render-engine';
import { SheetAlignmentPlugin, SheetHorizontalAlignmentFieldKey } from '@searsuite/sear-plugin-alignment';
import {
  SheetColumnHiddenOriginalSizesFieldKey,
  SheetColumnSizesFieldKey,
  SheetRowHiddenOriginalSizesFieldKey,
  SheetRowSizesFieldKey,
} from '@searsuite/sear-plugin-resize';
import { SheetColumnLabelPlugin } from '../src/sheet/SheetColumnLabel';
import { SheetRowNumberPlugin } from '../src/sheet/SheetRowNumber';

function dimensions(size: number) {
  return {
    shape: [1, 2] as [number, number],
    getItem: (_row: number, index: number) => (index === 1 ? 0 : size),
    getDimensionLeftBoundaryByIndex: (index: number) => index * size,
    getDimensionRightBoundaryByIndex: (index: number) => (index + 1) * size,
    getLeftBoundaryColIndexByDimension: (value: number) => Math.floor(value / size),
    getRightBoundaryColIndexByDimension: (value: number) => Math.floor(value / size),
  };
}

function createCore(plugin: { key: unknown }, config: object) {
  const create = jest.fn(() => ({ render: () => ({ node: true }) }));
  const state = { rowSizes: dimensions(20), columnSizes: dimensions(80) };
  const getDataType = (key: unknown) => {
    if (key === SheetDataPlugin.pluginKey) return { sheetData: {} };
    if (key === SheetAlignmentPlugin.pluginKey) return { cellAlignments: {} };
    return void 0;
  };
  const readDataViewField = (viewKey: string, fieldKey: string) => {
    if (viewKey !== SheetDataFieldNamespace) return null;
    if (fieldKey === SheetDataMatrixFieldKey) return {};
    if (fieldKey === SheetHorizontalAlignmentFieldKey) return {};
    if (fieldKey === SheetRowSizesFieldKey) return state.rowSizes;
    if (fieldKey === SheetColumnSizesFieldKey) return state.columnSizes;
    if (fieldKey === SheetRowHiddenOriginalSizesFieldKey) return {};
    if (fieldKey === SheetColumnHiddenOriginalSizesFieldKey) return {};
    return null;
  };
  return {
    create,
    core: {
      dataEngine: { getDataType, readDataViewField },
      getDataEngine: () => ({ getDataType, readDataViewField }),
      configEngine: { getPluginConfig: (key: unknown) => (key === plugin.key ? config : void 0) },
      renderEngine: {
        renderCoordinatorManager: { create },
        scrollManager: { getState: () => ({ x: 0, y: 0 }), getShape: () => [160, 40] },
      },
    },
  };
}

describe('sheet header plugins', () => {
  it('renders visible non-zero column headers with offsets', () => {
    const plugin = new SheetColumnLabelPlugin();
    const { core, create } = createCore(plugin, SheetColumnLabelPlugin.defaultConfig);
    expect(plugin.render(core as never, { x: 5, y: 7 })).toEqual([{ node: true }, { node: true }]);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'A' }),
      { x: 5, y: 7, width: 80, height: 24 },
      expect.any(Object),
    );
  });

  it('renders visible non-zero row headers with offsets', () => {
    const plugin = new SheetRowNumberPlugin();
    const { core, create } = createCore(plugin, SheetRowNumberPlugin.defaultConfig);
    expect(plugin.render(core as never, { x: 5, y: 7 })).toEqual([{ node: true }, { node: true }]);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ value: 1 }),
      { x: 5, y: 7, width: 50, height: 20 },
      expect.any(Object),
    );
  });

  it.each([
    ['column', SheetColumnLabelPlugin],
    ['row', SheetRowNumberPlugin],
  ] as const)('%s header plugin exposes its inert lifecycle and configuration contract', (_kind, PluginClass) => {
    const plugin = new PluginClass();

    expect(plugin.apply([])).toBe(plugin.getState());
    expect(plugin.initialize()).toBe(void 0);
    expect(plugin.onScroll({ x: 0, y: 0, deltaX: 0, deltaY: 0 })).toBe(void 0);
    expect(plugin.onResize()).toBe(void 0);
    expect(plugin.registerConfig()).toHaveLength(1);
    expect(plugin.registerState()).toEqual({ key: plugin.key, state: plugin.getState() });
    expect(plugin.getPluginConfig({ configEngine: { getPluginConfig: () => ({ ready: true }) } } as never)).toEqual({
      ready: true,
    });
  });

  it.each([
    ['column', SheetColumnLabelPlugin],
    ['row', SheetRowNumberPlugin],
  ] as const)('%s header plugin reports absent sheet data', (_kind, PluginClass) => {
    const plugin = new PluginClass();
    const core = {
      dataEngine: { getDataType: () => void 0 },
    };

    expect(() => plugin.render(core as never)).toThrow(
      PluginClass === SheetColumnLabelPlugin
        ? 'Sheet dimension fields are not found in SheetColumnLabelPlugin render.'
        : 'Sheet dimension fields are not found in SheetRowNumberPlugin render.',
    );
  });

  it('omits a header when its renderer cannot produce a node or returns undefined render result', () => {
    const pluginCol = new SheetColumnLabelPlugin();
    const coreCol = createCore(pluginCol, SheetColumnLabelPlugin.defaultConfig).core;
    coreCol.renderEngine.renderCoordinatorManager.create = jest.fn((_data, rect) => {
      if (rect.y === 0) return undefined; // first call undefined cell
      return { render: () => undefined }; // second call undefined render
    }) as never;

    expect(pluginCol.render(coreCol as never)).toEqual([]);

    const pluginRow = new SheetRowNumberPlugin();
    const coreRow = createCore(pluginRow, SheetRowNumberPlugin.defaultConfig).core;
    coreRow.renderEngine.renderCoordinatorManager.create = jest.fn((_data, rect) => {
      if (rect.y === 0) return undefined; // first call undefined cell
      return { render: () => undefined }; // second call undefined render
    }) as never;

    expect(pluginRow.render(coreRow as never)).toEqual([]);
  });
});
