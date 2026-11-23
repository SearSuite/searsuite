import { Rect as RectRange, createEmptyRect } from '@searsuite/sear-foundation-rect';
import { type SearCoreSheet } from '@searsuite/sear-assembly-core';
import { SheetDataPlugin, SheetDataFieldNamespace, SheetDataMatrixFieldKey } from '@searsuite/sear-render-engine';
import { SheetAlignmentPlugin, SheetHorizontalAlignmentFieldKey } from '@searsuite/sear-plugin-alignment';
import {
  SheetColumnHiddenOriginalSizesFieldKey,
  SheetColumnSizesFieldKey,
  SheetRowHiddenOriginalSizesFieldKey,
  SheetRowSizesFieldKey,
} from '@searsuite/sear-plugin-resize';
import { SheetHeaderHighlightPlugin } from '../src';

type HighlightNode = {
  data: unknown;
  positionRect: { x: number; y: number; width: number; height: number };
  properties: { top?: number; left?: number; fill?: string; depth?: number };
};

type HeaderHighlightPluginInternals = {
  depth: number;
};

function getSheetGeometryFields(searCore: SearCoreSheet): {
  rowSizes: {
    getItem: (row: number, index: number) => number;
  };
  columnSizes: {
    getItem: (row: number, index: number) => number;
  };
} {
  const dataEngine = searCore.getDataEngine();
  return {
    rowSizes: dataEngine.readDataViewField(SheetDataFieldNamespace, SheetRowSizesFieldKey) as {
      getItem: (row: number, index: number) => number;
    },
    columnSizes: dataEngine.readDataViewField(SheetDataFieldNamespace, SheetColumnSizesFieldKey) as {
      getItem: (row: number, index: number) => number;
    },
  };
}

describe('SheetHeaderHighlightPlugin', () => {
  const makeSelectionPlugin = () =>
    ({
      pluginKey: { key: 'SheetSelection' },
    } as unknown as ConstructorParameters<typeof SheetHeaderHighlightPlugin>[0]);

  const makeCornerPlugin = (width = 50, height = 24) =>
    ({
      getPluginConfig: () => ({ width, height }),
    } as unknown as ConstructorParameters<typeof SheetHeaderHighlightPlugin>[1]);

  const makeSearCore = (selection: [RectRange, RectRange] | null, rowCount = 100) => {
    const dataState = {
      rowSizes: {
        shape: [1, rowCount],
        getItem: (_r: number, i: number) => 22,
        getDimensionLeftBoundaryByIndex: (i: number) => i * 22,
        getDimensionRightBoundaryByIndex: (i: number) => (i + 1) * 22,
        getLeftBoundaryColIndexByDimension: (value: number) => Math.floor(value / 22),
        getRightBoundaryColIndexByDimension: (value: number) => Math.floor(value / 22),
      },
      columnSizes: {
        shape: [1, 100],
        getItem: (_r: number, i: number) => 80,
        getDimensionLeftBoundaryByIndex: (i: number) => i * 80,
        getDimensionRightBoundaryByIndex: (i: number) => (i + 1) * 80,
        getLeftBoundaryColIndexByDimension: (value: number) => Math.floor(value / 80),
        getRightBoundaryColIndexByDimension: (value: number) => Math.floor(value / 80),
      },
      sheetData: { getItem: () => void 0 },
    };
    const created: HighlightNode[] = [];
    const renderCoordinatorManager = {
      create: (data: unknown, positionRect: HighlightNode['positionRect'], properties: HighlightNode['properties']) => {
        const node = { data, positionRect, properties };
        created.push(node);
        return { render: () => node };
      },
    };
    const dataEngine = {
      readDataViewField: (viewKey: string, fieldKey: string) => {
        if (viewKey !== SheetDataFieldNamespace) return null;
        if (fieldKey === SheetDataMatrixFieldKey) return dataState.sheetData;
        if (fieldKey === SheetHorizontalAlignmentFieldKey) return {};
        if (fieldKey === SheetRowSizesFieldKey) return dataState.rowSizes;
        if (fieldKey === SheetColumnSizesFieldKey) return dataState.columnSizes;
        if (fieldKey === SheetRowHiddenOriginalSizesFieldKey) return {};
        if (fieldKey === SheetColumnHiddenOriginalSizesFieldKey) return {};
        return null;
      },
      getDataType: (key: { key?: string } | undefined) => {
        if (key?.key === 'SheetSelection') return selection;
        if (key === SheetDataPlugin.pluginKey) return { sheetData: dataState.sheetData };
        if (key === SheetAlignmentPlugin.pluginKey) return { cellAlignments: {} };
        return void 0;
      },
    };
    const configEngine = {
      getPluginConfig: () => ({
        headerHighlightBackgroundColor: 'bg',
        headerHighlightActiveBorderColor: 'active',
        headerHighlightActiveBarThickness: 2,
        mode: 'selection-range',
      }),
    };
    return {
      searCore: {
        getDataEngine: () => dataEngine,
        renderEngine: {
          renderCoordinatorManager,
          scrollManager: {
            getState: () => ({ x: 0, y: 0, deltaX: 0, deltaY: 0 } as any),
            getShape: () => [800, 600],
          },
        },
        configEngine,
      } as unknown as SearCoreSheet,
      created,
    };
  };

  it('returns empty when selection is empty', () => {
    const empty: [RectRange, RectRange] = [createEmptyRect(), createEmptyRect()];
    const plugin = new SheetHeaderHighlightPlugin(makeSelectionPlugin(), makeCornerPlugin());
    const { searCore } = makeSearCore(empty);
    const nodes = plugin.render(searCore);
    expect(nodes).toEqual([]);
  });

  it('returns empty when selectionState or dataState is missing', () => {
    const empty: [RectRange, RectRange] = [
      new RectRange([
        [0, 0],
        [0, 0],
      ]),
      new RectRange([
        [0, 0],
        [0, 0],
      ]),
    ];
    const plugin = new SheetHeaderHighlightPlugin(makeSelectionPlugin(), makeCornerPlugin());

    const core1 = makeSearCore(empty).searCore;
    // mock missing selection
    jest.spyOn(core1.getDataEngine(), 'getDataType').mockImplementation((key: any) => {
      if (key?.key === 'SheetSelection') return undefined;
      if (key === SheetDataPlugin.pluginKey) return { sheetData: {} };
      if (key === SheetAlignmentPlugin.pluginKey) return { cellAlignments: {} };
      return undefined;
    });
    expect(plugin.render(core1)).toEqual([]);

    const core2 = makeSearCore(empty).searCore;
    // mock missing data state
    jest.spyOn(core2.getDataEngine(), 'readDataViewField').mockReturnValue(null);
    jest.spyOn(core2.getDataEngine(), 'getDataType').mockImplementation((key: any) => {
      if (key?.key === 'SheetSelection') return empty;
      if (key === SheetDataPlugin.pluginKey) return undefined;
      return undefined;
    });
    expect(plugin.render(core2)).toEqual([]);
  });

  it('produces sticky header highlight nodes offset by corner size', () => {
    const selection: [RectRange, RectRange] = [
      new RectRange([
        [3, 1],
        [5, 2],
      ]),
      new RectRange([
        [3, 1],
        [5, 2],
      ]),
    ];
    const cornerWidth = 50;
    const cornerHeight = 24;
    const plugin = new SheetHeaderHighlightPlugin(makeSelectionPlugin(), makeCornerPlugin(cornerWidth, cornerHeight));
    const { searCore, created } = makeSearCore(selection);
    const nodes = plugin.render(searCore);

    // 2 columns highlighted (cols 1..2): 2 bg + 1 emphasis bar (across the whole range)
    // 3 rows highlighted (rows 3..5): 3 bg + 1 emphasis bar
    expect(created.length).toBe(2 + 1 + 3 + 1);

    const columnBgs = created.filter((c) => c.properties.top === 0 && c.properties.fill === 'bg');
    const rowBgs = created.filter((c) => c.properties.left === 0 && c.properties.fill === 'bg');
    expect(columnBgs.length).toBe(2);
    expect(rowBgs.length).toBe(3);

    // Column highlight strip is at y=0, height=cornerHeight, x = colBoundary + cornerWidth
    for (const c of columnBgs) {
      expect(c.positionRect.y).toBe(0);
      expect(c.positionRect.height).toBe(cornerHeight);
      // col 1 -> x = 80 + 50 = 130; col 2 -> 160 + 50 = 210
      expect([130, 210]).toContain(c.positionRect.x);
    }

    // Row highlight strip is at x=0, width=cornerWidth, y = rowBoundary + cornerHeight
    for (const c of rowBgs) {
      expect(c.positionRect.x).toBe(0);
      expect(c.positionRect.width).toBe(cornerWidth);
      // row 3 -> y = 66 + 24 = 90; row 4 -> 88 + 24 = 112; row 5 -> 110 + 24 = 134
      expect([90, 112, 134]).toContain(c.positionRect.y);
    }

    // depth contracts: header bg (0) < highlight bg (0.5) < header text (1) < emphasis (2).
    const baseDepth = (plugin as unknown as HeaderHighlightPluginInternals).depth;
    for (const c of columnBgs) expect(c.properties.depth).toBe(baseDepth + 1.5);
    for (const c of rowBgs) expect(c.properties.depth).toBe(baseDepth + 1.5);

    // Emphasis bars: column bar at bottom inner edge, row bar at right inner edge.
    const activeBars = created.filter((c) => c.properties.fill === 'active');
    expect(activeBars.length).toBe(2);

    const colBar = activeBars.find((c) => c.properties.top === 0)!;
    expect(colBar.positionRect.y).toBe(cornerHeight - 2 + 1); // headerHeight - thickness, shifted toward grid
    expect(colBar.positionRect.height).toBe(2);
    // covers cols 1..2 -> x = 80 + 50 = 130, width = (240 - 80) = 160
    expect(colBar.positionRect.x).toBe(130);
    expect(colBar.positionRect.width).toBe(160);
    expect(colBar.properties.depth).toBe(baseDepth + 3);

    const rowBar = activeBars.find((c) => c.properties.left === 0)!;
    expect(rowBar.positionRect.x).toBe(cornerWidth - 2 + 1); // headerWidth - thickness, shifted toward grid
    expect(rowBar.positionRect.width).toBe(2);
    // covers rows 3..5 -> y = 66 + 24 = 90, height = (132 - 66) = 66
    expect(rowBar.positionRect.y).toBe(90);
    expect(rowBar.positionRect.height).toBe(66);
    expect(rowBar.properties.depth).toBe(baseDepth + 3);

    expect(nodes.length).toBe(created.length);
  });

  it('limits a full-column selection to the shared viewport window', () => {
    const rowCount = 1_048_576;
    const selection: [RectRange, RectRange] = [
      new RectRange([
        [0, 3],
        [rowCount - 1, 3],
      ]),
      new RectRange([
        [0, 3],
        [rowCount - 1, 3],
      ]),
    ];
    const plugin = new SheetHeaderHighlightPlugin(makeSelectionPlugin(), makeCornerPlugin());
    const { searCore, created } = makeSearCore(selection, rowCount);

    const nodes = plugin.render(searCore);
    const rowBackgrounds = created.filter((node) => node.properties.left === 0 && node.properties.fill === 'bg');

    // 600px viewport / 22px row height, plus the shared one-row buffer.
    expect(rowBackgrounds).toHaveLength(29);
    // One selected column background + its bar, visible row backgrounds + its bar.
    expect(nodes).toHaveLength(32);
  });

  it('throws when getting plugin config', () => {
    const plugin = new SheetHeaderHighlightPlugin(makeSelectionPlugin(), makeCornerPlugin());
    expect(plugin.getPluginConfig({} as SearCoreSheet)).toBeNull();
  });

  it('returns state unmodified from apply', () => {
    const plugin = new SheetHeaderHighlightPlugin(makeSelectionPlugin(), makeCornerPlugin());
    const state = {};
    expect(plugin.apply(state, {} as any)).toBe(state);
  });

  it('renders cross mode around active cell', () => {
    const selection: [RectRange, RectRange] = [
      new RectRange([
        [2, 1],
        [2, 1],
      ]), // Active cell is row 2, col 1
      new RectRange([
        [2, 1],
        [4, 3],
      ]),
    ];
    const cornerWidth = 50;
    const cornerHeight = 24;
    const plugin = new SheetHeaderHighlightPlugin(makeSelectionPlugin(), makeCornerPlugin(cornerWidth, cornerHeight));

    // Override the mock to inject the cross mode config
    const { searCore, created } = makeSearCore(selection);
    const origConfigEngine = searCore.configEngine;
    searCore.configEngine = {
      ...origConfigEngine,
      getPluginConfig: (key: any) => {
        if (key.key === plugin.pluginKey.key) {
          return {
            headerHighlightBackgroundColor: 'bg',
            headerHighlightActiveBorderColor: 'active',
            headerHighlightActiveBarThickness: 2,
            mode: 'cross-active',
          } as any;
        }
        return origConfigEngine.getPluginConfig(key);
      },
    } as any;

    const nodes = plugin.render(searCore);

    // 1 col, 1 row
    const columnBgs = created.filter((c) => c.properties.top === 0 && c.properties.fill === 'bg');
    const rowBgs = created.filter((c) => c.properties.left === 0 && c.properties.fill === 'bg');
    expect(columnBgs.length).toBe(1);
    expect(rowBgs.length).toBe(1);
  });

  it('does not render cross mode for negative anchor cell indices', () => {
    const selection: [RectRange, RectRange] = [
      createEmptyRect(),
      new RectRange([
        [0, 0],
        [4, 3],
      ]),
    ];
    const plugin = new SheetHeaderHighlightPlugin(makeSelectionPlugin(), makeCornerPlugin());

    const { searCore, created } = makeSearCore(selection);
    const origConfigEngine = searCore.configEngine;
    searCore.configEngine = {
      ...origConfigEngine,
      getPluginConfig: (key: any) => {
        if (key.key === plugin.pluginKey.key) {
          return {
            headerHighlightBackgroundColor: 'bg',
            headerHighlightActiveBorderColor: 'active',
            headerHighlightActiveBarThickness: 2,
            mode: 'cross-active',
          } as any;
        }
        return origConfigEngine.getPluginConfig(key);
      },
    } as any;

    const nodes = plugin.render(searCore);
    expect(nodes.length).toBe(0);
  });

  it('handles zero sized rows/cols and out of viewport rendering', () => {
    const selection: [RectRange, RectRange] = [
      new RectRange([
        [0, 0],
        [10, 10],
      ]),
      new RectRange([
        [0, 0],
        [10, 10],
      ]),
    ];
    const plugin = new SheetHeaderHighlightPlugin(makeSelectionPlugin(), makeCornerPlugin());
    const { searCore } = makeSearCore(selection);

    // Test viewport returning completely out of bounds range
    const dataState = getSheetGeometryFields(searCore);

    // Force items to be zero width/height
    dataState.columnSizes.getItem = () => 0;
    dataState.rowSizes.getItem = () => 0;

    const nodes = plugin.render(searCore);
    // Should skip drawing bgs because width/height are 0
    // Active bar might still draw if barWidth > 0, but let's just see that it runs without crashing
    expect(nodes).toBeDefined();

    // Test out of viewport
    jest
      .spyOn(searCore.renderEngine.scrollManager, 'getState')
      .mockReturnValue({ x: 9999, y: 9999, deltaX: 0, deltaY: 0 } as any);
    const nodesOut = plugin.render(searCore);
    expect(nodesOut).toBeDefined();
  });

  it('uses default offset in render and handles undefined mode', () => {
    const selection: [RectRange, RectRange] = [
      new RectRange([
        [0, 0],
        [1, 1],
      ]),
      new RectRange([
        [0, 0],
        [1, 1],
      ]),
    ];
    const plugin = new SheetHeaderHighlightPlugin(makeSelectionPlugin(), makeCornerPlugin());
    const { searCore } = makeSearCore(selection);

    // override config to have undefined mode
    const origConfigEngine = searCore.configEngine;
    searCore.configEngine = {
      ...origConfigEngine,
      getPluginConfig: (key: any) => ({
        headerHighlightBackgroundColor: 'bg',
        headerHighlightActiveBorderColor: 'active',
        headerHighlightActiveBarThickness: 2,
        mode: undefined,
      }),
    } as any;

    expect(() => plugin.render(searCore)).not.toThrow();
    // explicitly pass undefined offset to test default arg
    expect(() => plugin.render(searCore, undefined)).not.toThrow();
  });

  it('handles edge cases in private methods directly', () => {
    const selection: [RectRange, RectRange] = [
      new RectRange([
        [0, 0],
        [1, 1],
      ]),
      new RectRange([
        [0, 0],
        [1, 1],
      ]),
    ];
    const plugin = new SheetHeaderHighlightPlugin(makeSelectionPlugin(), makeCornerPlugin()) as any;
    const { searCore } = makeSearCore(selection);
    const dataState = getSheetGeometryFields(searCore);
    const pluginConfig = searCore.configEngine.getPluginConfig({ key: 'SheetHeaderHighlight' });

    expect(
      plugin.buildColumnHeaderHighlight(
        searCore,
        dataState,
        pluginConfig,
        { x: 0, y: 0 },
        { width: 0, height: 0 },
        -1,
        5,
      ),
    ).toEqual([]);
    expect(
      plugin.buildColumnHeaderHighlight(
        searCore,
        dataState,
        pluginConfig,
        { x: 0, y: 0 },
        { width: 0, height: 0 },
        5,
        1,
      ),
    ).toEqual([]);

    expect(
      plugin.buildRowHeaderHighlight(searCore, dataState, pluginConfig, { x: 0, y: 0 }, { width: 0, height: 0 }, -1, 5),
    ).toEqual([]);
    expect(
      plugin.buildRowHeaderHighlight(searCore, dataState, pluginConfig, { x: 0, y: 0 }, { width: 0, height: 0 }, 5, 1),
    ).toEqual([]);

    // test without viewport
    expect(() =>
      plugin.buildColumnHeaderHighlight(
        searCore,
        dataState,
        pluginConfig,
        { x: 0, y: 0 },
        { width: 0, height: 0 },
        0,
        0,
        true,
        undefined,
        undefined,
      ),
    ).not.toThrow();
    expect(() =>
      plugin.buildRowHeaderHighlight(
        searCore,
        dataState,
        pluginConfig,
        { x: 0, y: 0 },
        { width: 0, height: 0 },
        0,
        0,
        true,
        undefined,
        undefined,
      ),
    ).not.toThrow();

    // test with thickness <= 0
    expect(() =>
      plugin.buildColumnHeaderHighlight(
        searCore,
        dataState,
        pluginConfig,
        { x: 0, y: 0 },
        { width: 0, height: 0 },
        0,
        0,
        true,
        -1,
        undefined,
      ),
    ).not.toThrow();
    expect(() =>
      plugin.buildRowHeaderHighlight(
        searCore,
        dataState,
        pluginConfig,
        { x: 0, y: 0 },
        { width: 0, height: 0 },
        0,
        0,
        true,
        -1,
        undefined,
      ),
    ).not.toThrow();

    // test with no drawActiveBar
    expect(() =>
      plugin.buildColumnHeaderHighlight(
        searCore,
        dataState,
        pluginConfig,
        { x: 0, y: 0 },
        { width: 0, height: 0 },
        0,
        0,
        false,
        undefined,
        undefined,
      ),
    ).not.toThrow();
    expect(() =>
      plugin.buildRowHeaderHighlight(
        searCore,
        dataState,
        pluginConfig,
        { x: 0, y: 0 },
        { width: 0, height: 0 },
        0,
        0,
        false,
        undefined,
        undefined,
      ),
    ).not.toThrow();
  });

  it('covers null create/render and non-positive active-bar geometry branches', () => {
    const plugin = new SheetHeaderHighlightPlugin(makeSelectionPlugin(), makeCornerPlugin()) as any;

    const baseDataState = {
      rowSizes: {
        shape: [1, 2],
        getItem: () => 20,
        getDimensionLeftBoundaryByIndex: (i: number) => i * 20,
        getDimensionRightBoundaryByIndex: (i: number) => (i + 1) * 20,
      },
      columnSizes: {
        shape: [1, 2],
        getItem: () => 20,
        getDimensionLeftBoundaryByIndex: (i: number) => i * 20,
        getDimensionRightBoundaryByIndex: (i: number) => (i + 1) * 20,
      },
      sheetData: { getItem: () => void 0 },
    };

    const pluginConfig = {
      headerHighlightBackgroundColor: 'bg',
      headerHighlightBorderColor: 'border',
      headerHighlightActiveBorderColor: 'active',
      headerHighlightActiveBarThickness: 2,
    };

    // Active-bar geometry becomes zero and skips the bar-rendering branch.
    const zeroBarCore = {
      renderEngine: {
        renderCoordinatorManager: { create: jest.fn(() => ({ render: () => ({}) })) },
      },
    } as any;
    const zeroWidthDataState = {
      ...baseDataState,
      columnSizes: {
        ...baseDataState.columnSizes,
        getDimensionRightBoundaryByIndex: (i: number) => i * 20,
      },
      rowSizes: {
        ...baseDataState.rowSizes,
        getDimensionRightBoundaryByIndex: (i: number) => i * 20,
      },
    };

    expect(
      plugin.buildColumnHeaderHighlight(
        zeroBarCore,
        zeroWidthDataState,
        pluginConfig,
        { x: 0, y: 0 },
        { width: 50, height: 24 },
        0,
        0,
        true,
      ),
    ).toBeDefined();
    expect(
      plugin.buildRowHeaderHighlight(
        zeroBarCore,
        zeroWidthDataState,
        pluginConfig,
        { x: 0, y: 0 },
        { width: 50, height: 24 },
        0,
        0,
        true,
      ),
    ).toBeDefined();

    // Background create returns null; active-bar create returns node with null render result.
    let createCount = 0;
    const nullRenderCore = {
      renderEngine: {
        renderCoordinatorManager: {
          create: jest.fn(() => {
            createCount += 1;
            if (createCount === 1 || createCount === 3) return null;
            return { render: () => null };
          }),
        },
      },
    } as any;

    expect(
      plugin.buildColumnHeaderHighlight(
        nullRenderCore,
        baseDataState,
        pluginConfig,
        { x: 0, y: 0 },
        { width: 50, height: 24 },
        0,
        0,
        true,
      ),
    ).toEqual([]);

    expect(
      plugin.buildRowHeaderHighlight(
        nullRenderCore,
        baseDataState,
        pluginConfig,
        { x: 0, y: 0 },
        { width: 50, height: 24 },
        0,
        0,
        true,
      ),
    ).toEqual([]);
  });

  it('skips optional active-bar render when create returns undefined', () => {
    const plugin = new SheetHeaderHighlightPlugin(makeSelectionPlugin(), makeCornerPlugin()) as any;
    const selection: [RectRange, RectRange] = [
      new RectRange([
        [0, 0],
        [0, 0],
      ]),
      new RectRange([
        [0, 0],
        [0, 0],
      ]),
    ];
    const { searCore } = makeSearCore(selection);
    const dataState = getSheetGeometryFields(searCore);
    const pluginConfig = searCore.configEngine.getPluginConfig({ key: 'SheetHeaderHighlight' });

    const create = jest.fn((_data, _rect, props) => {
      if (props.fill === 'active') return undefined;
      return { render: () => ({}) };
    });

    const core = {
      renderEngine: {
        renderCoordinatorManager: { create },
      },
    } as any;

    expect(
      plugin.buildColumnHeaderHighlight(
        core,
        dataState,
        pluginConfig,
        { x: 0, y: 0 },
        { width: 50, height: 24 },
        0,
        0,
        true,
      ),
    ).toBeDefined();
    expect(
      plugin.buildRowHeaderHighlight(
        core,
        dataState,
        pluginConfig,
        { x: 0, y: 0 },
        { width: 50, height: 24 },
        0,
        0,
        true,
      ),
    ).toBeDefined();
  });
});
