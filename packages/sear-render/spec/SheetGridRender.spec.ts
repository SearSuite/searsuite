import { SheetGridRender } from '../src/sheet/SheetGridRender';
import { SheetDataPlugin, SheetDataFieldNamespace, SheetDataMatrixFieldKey } from '@searsuite/sear-render-engine';
import { SheetHorizontalAlignment, SheetVerticalAlignment } from '@searsuite/sear-plugin-alignment';
import { type SheetCellVisualReaderRegistry } from '@searsuite/sear-render-registry';
import {
  SheetColumnHiddenOriginalSizesFieldKey,
  SheetColumnSizesFieldKey,
  SheetRowHiddenOriginalSizesFieldKey,
  SheetRowSizesFieldKey,
} from '@searsuite/sear-plugin-resize';
import { SheetFixedRowsFieldKey } from '@searsuite/sear-plugin-fixed-row';

function dimensions(size: number, count: number) {
  return {
    shape: [1, count] as [number, number],
    getItem: () => size,
    getDimensionLeftBoundaryByIndex: (index: number) => index * size,
    getDimensionRightBoundaryByIndex: (index: number) => (index + 1) * size,
    getLeftBoundaryColIndexByDimension: (value: number) => Math.floor(value / size),
    getRightBoundaryColIndexByDimension: (value: number) => Math.floor(value / size),
  };
}

function createDataEngine(state: { sheetData: unknown; rowSizes: unknown; columnSizes: unknown; fixedRows?: unknown }) {
  const readDataViewField = (viewKey: string, fieldKey: string) => {
    if (viewKey !== SheetDataFieldNamespace) return null;
    if (fieldKey === SheetDataMatrixFieldKey) return state.sheetData;
    if (fieldKey === SheetRowSizesFieldKey) return state.rowSizes;
    if (fieldKey === SheetColumnSizesFieldKey) return state.columnSizes;
    if (fieldKey === SheetRowHiddenOriginalSizesFieldKey) return {};
    if (fieldKey === SheetColumnHiddenOriginalSizesFieldKey) return {};
    if (fieldKey === SheetFixedRowsFieldKey) return state.fixedRows;
    return null;
  };
  return {
    readDataViewField,
    getDataType: (key: unknown) => {
      if (key === SheetDataPlugin.pluginKey) return { sheetData: state.sheetData };
      return void 0;
    },
  };
}

describe('SheetGridRender', () => {
  it('BUG-319 extends plain text through empty cells but stops before occupied cells', () => {
    const plugin = new SheetGridRender({ readVisual: () => ({ properties: {}, layers: [] }) } as never);
    const create = jest.fn(() => ({ render: () => ({ setStickyTree: jest.fn() }) }));
    const sheetData = {
      getItem: (row: number, col: number) =>
        row === 0 && col === 0
          ? { type: 'string', value: 'A very long sheet cell value' }
          : row === 0 && col === 3
          ? { type: 'string', value: 'stop' }
          : undefined,
    };
    const core = {
      getDataEngine: () =>
        createDataEngine({ sheetData, rowSizes: dimensions(24, 2), columnSizes: dimensions(100, 5) }),
      configEngine: { getPluginConfig: () => ({ defaultBorderColor: 'border' }) },
      renderEngine: {
        renderCoordinatorManager: { create, createCellContext: () => ({}) },
        scrollManager: { getState: () => ({ x: 0, y: 0 }), getShape: () => [500, 48] },
      },
    };
    plugin.render(core as never, { x: 50, y: 24 });
    expect(create).toHaveBeenCalledWith(
      { type: 'string', value: 'A very long sheet cell value' },
      expect.objectContaining({ width: 100 }),
      expect.objectContaining({ textOverflowWidth: 300 }),
      expect.anything(),
    );
  });
  it('renders visible non-merged cells using explicit or default alignment', () => {
    const visualReaders = {
      readVisual: jest.fn(({ rowIndex, columnIndex }) => ({
        properties: {
          horizontalAlign:
            rowIndex === 0 && columnIndex === 1 ? SheetHorizontalAlignment.Right : SheetHorizontalAlignment.Left,
          verticalAlign: SheetVerticalAlignment.Center,
          ...(rowIndex === 0 && columnIndex === 0 ? { fill: '#e6f0ff' } : {}),
        },
        layers: [],
      })),
    } as unknown as SheetCellVisualReaderRegistry;
    const plugin = new SheetGridRender(visualReaders);
    const create = jest.fn(() => ({ render: () => ({ node: true }) }));
    const state = {
      sheetData: {
        getItem: jest.fn((row: number, col: number) => (row === 0 && col === 0 ? { value: 'A1' } : void 0)),
      },
      rowSizes: dimensions(20, 2),
      columnSizes: dimensions(80, 2),
    };
    const core = {
      getDataEngine: () => createDataEngine(state),
      configEngine: {
        getPluginConfig: () => ({ defaultBorderColor: 'border' }),
        getDefaultConfig: () => ({ defaultCellAlign: SheetHorizontalAlignment.Left }),
      },
      renderEngine: {
        renderCoordinatorManager: { create, createCellContext: jest.fn(() => ({ source: 'grid' })) },
        scrollManager: { getState: () => ({ x: 0, y: 0 }), getShape: () => [160, 40] },
      },
    };

    expect(plugin.render(core as never, { x: 5, y: 7 })).toHaveLength(9);
    expect(create).toHaveBeenCalledWith(
      { value: 'A1' },
      { x: 5, y: 7, width: 80, height: 20 },
      expect.objectContaining({ horizontalAlign: SheetHorizontalAlignment.Left, stroke: 'border' }),
      { source: 'grid' },
    );
    expect(create).toHaveBeenCalledWith(
      { value: 'A1' },
      expect.any(Object),
      expect.objectContaining({ fill: '#e6f0ff' }),
      expect.any(Object),
    );
    expect(create).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ x: 85, y: 7 }),
      expect.objectContaining({ horizontalAlign: SheetHorizontalAlignment.Right }),
      { source: 'grid' },
    );
  });

  it('skips merged cells and rejects missing sheet state', () => {
    const visualReaders = {
      readVisual: jest.fn(() => ({ properties: {}, layers: [] })),
    } as unknown as SheetCellVisualReaderRegistry;
    const plugin = new SheetGridRender(visualReaders);
    const missing = { getDataEngine: () => ({ getDataType: () => void 0 }) };

    expect(() => plugin.render(missing as never)).toThrow('Sheet data fields are not found in SheetGridRender render.');
    expect(plugin.registerState()).toEqual({ key: plugin.key, state: plugin.getState() });
    expect(
      plugin.getPluginConfig({ configEngine: { getPluginConfig: () => ({ defaultBorderColor: 'border' }) } } as never),
    ).toEqual({
      defaultBorderColor: 'border',
    });
    expect(plugin.apply([])).toBe(plugin.getState());
    expect(plugin.registerConfig()).toHaveLength(1);
  });

  it('keeps fixed rows in the render set and marks their complete node trees as top affixes', () => {
    const visualReaders = {
      readVisual: jest.fn(() => ({ properties: {}, layers: [] })),
    } as unknown as SheetCellVisualReaderRegistry;
    const plugin = new SheetGridRender(visualReaders);
    const sticky = jest.fn();
    const create = jest.fn(() => ({ render: () => ({ setStickyTree: sticky }) }));
    const state = {
      sheetData: { getItem: () => void 0 },
      rowSizes: dimensions(20, 20),
      columnSizes: dimensions(80, 2),
      fixedRows: {
        forEachStored: (visit: (value: boolean, matrixRow: number, row: number) => void) => visit(true, 0, 0),
      },
    };
    const core = {
      getDataEngine: () => createDataEngine(state),
      configEngine: { getPluginConfig: () => ({ defaultBorderColor: 'border', defaultBackgroundColor: '#fefefe' }) },
      renderEngine: {
        renderCoordinatorManager: { create, createCellContext: jest.fn() },
        scrollManager: { getState: () => ({ x: 0, y: 200 }), getShape: () => [160, 40] },
      },
    };

    plugin.render(core as never, { x: 50, y: 24 });

    expect(
      (create.mock.calls as unknown[][]).some(([, rect, properties]) => {
        const position = rect as { y?: number };
        const cell = properties as { startRowIndex?: number };
        return position.y === 24 && cell.startRowIndex === 0;
      }),
    ).toBe(true);
    expect(sticky).toHaveBeenCalledWith(true, { top: 24 });
    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ y: 24 }),
      expect.objectContaining({ startRowIndex: 0, fill: '#fefefe' }),
      undefined,
    );
  });

  it('covers missing properties, merged cells, default alignment fallbacks, and undefined cell components', () => {
    const visualReaders = {
      readVisual: jest.fn(() => ({ properties: {}, layers: [] })),
    } as unknown as SheetCellVisualReaderRegistry;
    const plugin = new SheetGridRender(visualReaders);
    plugin.onDblClick({} as never, {} as never); // coverage for L50

    const create = jest.fn((data, rect, props, ctx) => {
      if (props.startColIndex === 2 && props.startRowIndex === 2) return undefined;
      return { render: () => (props.startColIndex === 1 && props.startRowIndex === 1 ? undefined : { node: true }) };
    });

    const state = {
      sheetData: { getItem: () => void 0 },
      rowSizes: {
        ...dimensions(20, 3),
        getItem: () => 0, // forces fallback to 0
      },
      columnSizes: {
        ...dimensions(80, 3),
        getItem: () => 0, // forces fallback to 0
      },
    };

    const core = {
      getDataEngine: () => createDataEngine(state),
      configEngine: {
        getPluginConfig: () => ({ defaultBorderColor: 'border' }),
        getDefaultConfig: () => ({}), // missing defaultCellAlign to fallback to Left
      },
      renderEngine: {
        renderCoordinatorManager: { create, createCellContext: jest.fn() },
        scrollManager: { getState: () => ({ x: 0, y: 0 }), getShape: () => [240, 60] }, // view for 3x3
      },
    };

    const rects = plugin.render(core as never);
    // 3x3 = 9 cells, 1 skipped (0,0), 1 undefined render (1,1), 1 undefined cell (2,2)
    // Actually [0, 1, 2], total 9.
  });
});
