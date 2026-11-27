import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { SheetDataFieldNamespace, SheetDataMatrixFieldKey } from '@searsuite/sear-domain-sheet';
import { SheetAlignmentPlugin, SheetHorizontalAlignmentFieldKey } from '@searsuite/sear-plugin-alignment';
import {
  SheetColumnHiddenOriginalSizesFieldKey,
  SheetColumnSizesFieldKey,
  SheetRowHiddenOriginalSizesFieldKey,
  SheetRowSizesFieldKey,
} from '@searsuite/sear-plugin-resize';
import { SheetColumnLabelView } from '../src/sheet/SheetColumnLabel';
import { SheetRowNumberView } from '../src/sheet/SheetRowNumber';

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
      configEngine: { getConfig: (key: unknown) => (key === plugin.key ? config : void 0) },
      renderEngine: {
        renderCoordinatorManager: { create },
        scrollManager: { getState: () => ({ x: 0, y: 0 }), getShape: () => [160, 40] },
      },
    },
  };
}

describe('sheet header plugins', () => {
  it('renders visible non-zero column headers with offsets', () => {
    const plugin = new SheetColumnLabelView();
    const { core, create } = createCore(plugin, SheetColumnLabelView.defaultConfig);
    expect(plugin.render(core as never, { x: 5, y: 7 })).toEqual([{ node: true }, { node: true }]);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'A' }),
      { x: 5, y: 7, width: 80, height: 24 },
      expect.any(Object),
    );
  });

  it('renders visible non-zero row headers with offsets', () => {
    const plugin = new SheetRowNumberView();
    const { core, create } = createCore(plugin, SheetRowNumberView.defaultConfig);
    expect(plugin.render(core as never, { x: 5, y: 7 })).toEqual([{ node: true }, { node: true }]);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ value: 1 }),
      { x: 5, y: 7, width: 50, height: 20 },
      expect.any(Object),
    );
  });

  it.each([
    ['column', SheetColumnLabelView],
    ['row', SheetRowNumberView],
  ] as const)('%s header plugin exposes its inert lifecycle and configuration contract', (_kind, PluginClass) => {
    const plugin = new PluginClass();

    expect(plugin.initialize()).toBe(void 0);
    expect(plugin.onScroll({ x: 0, y: 0, deltaX: 0, deltaY: 0 })).toBe(void 0);
    expect(plugin.onResize()).toBe(void 0);
    expect(plugin.registerConfig()).toHaveLength(1);
    expect(plugin.getConfig({ configEngine: { getConfig: () => ({ ready: true }) } } as never)).toEqual({
      ready: true,
    });
  });

  it.each([
    ['column', SheetColumnLabelView],
    ['row', SheetRowNumberView],
  ] as const)('%s header plugin reports absent sheet data', (_kind, PluginClass) => {
    const plugin = new PluginClass();
    const core = {
      dataEngine: { getDataType: () => void 0 },
    };

    expect(() => plugin.render(core as never)).toThrow(
      PluginClass === SheetColumnLabelView
        ? 'Sheet dimension fields are not found in SheetColumnLabelView render.'
        : 'Sheet dimension fields are not found in SheetRowNumberView render.',
    );
  });

  it('omits a header when its renderer cannot produce a node or returns undefined render result', () => {
    const pluginCol = new SheetColumnLabelView();
    const coreCol = createCore(pluginCol, SheetColumnLabelView.defaultConfig).core;
    coreCol.renderEngine.renderCoordinatorManager.create = jest.fn((_data, rect) => {
      if (rect.y === 0) return undefined; // first call undefined cell
      return { render: () => undefined }; // second call undefined render
    }) as never;

    expect(pluginCol.render(coreCol as never)).toEqual([]);

    const pluginRow = new SheetRowNumberView();
    const coreRow = createCore(pluginRow, SheetRowNumberView.defaultConfig).core;
    coreRow.renderEngine.renderCoordinatorManager.create = jest.fn((_data, rect) => {
      if (rect.y === 0) return undefined; // first call undefined cell
      return { render: () => undefined }; // second call undefined render
    }) as never;

    expect(pluginRow.render(coreRow as never)).toEqual([]);
  });
});
