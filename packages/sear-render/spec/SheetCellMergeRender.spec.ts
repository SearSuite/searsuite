import { SheetCellMergeRender } from '../src/sheet/SheetCellMergeRender';
import { SheetDataFieldNamespace, SheetDataMatrixFieldKey } from '@searsuite/sear-render-engine';
import { SheetColumnSizesFieldKey, SheetRowSizesFieldKey } from '@searsuite/sear-plugin-resize';
import { SheetCellMergeFieldKey } from '@searsuite/sear-plugin-cell-merge';
import { FormulaCell, type SheetCellVisualReaderRegistry } from '@searsuite/sear-render-registry';

describe('SheetCellMergeRender', () => {
  it('renders the anchor value with its cell context after merging', () => {
    const formula = { type: FormulaCell.symbol, value: '=1+1' };
    const provider = { getFormulaResult: jest.fn(() => 2) };
    const createCellContext = jest.fn((row: number, col: number) => ({ row, col, formulaResultProvider: provider }));
    const create = jest.fn((data, rect, properties, context) => new FormulaCell(data, rect, properties, context));
    const plugin = new SheetCellMergeRender({ readVisual: () => ({ properties: {}, layers: [] }) } as unknown as SheetCellVisualReaderRegistry);
    const rowSizes = {
      shape: [1, 2],
      getDimensionLeftBoundaryByIndex: (index: number) => index * 24,
      getDimensionRightBoundaryByIndex: (index: number) => (index + 1) * 24,
    };
    const columnSizes = {
      shape: [1, 2],
      getDimensionLeftBoundaryByIndex: (index: number) => index * 100,
      getDimensionRightBoundaryByIndex: (index: number) => (index + 1) * 100,
    };
    const fields = new Map<string, unknown>([
      [SheetDataMatrixFieldKey, { getItem: () => formula }],
      [SheetRowSizesFieldKey, rowSizes],
      [SheetColumnSizesFieldKey, columnSizes],
      [
        SheetCellMergeFieldKey,
        {
          forEachStored: (visit: (value: unknown, row: number, col: number) => void) =>
            visit({ endRow: 0, endColumn: 1 }, 0, 0),
        },
      ],
    ]);
    const core = {
      getDataEngine: () => ({
        readDataViewField: (namespace: string, key: string) =>
          namespace === SheetDataFieldNamespace ? fields.get(key) : null,
      }),
      configEngine: { getPluginConfig: () => ({ defaultBorderColor: '#ddd' }) },
      renderEngine: { renderCoordinatorManager: { create, createCellContext } },
    };

    const nodes = plugin.render(core as never);

    expect(nodes).toHaveLength(1);
    expect(createCellContext).toHaveBeenCalledWith(0, 0);
    expect(create.mock.calls[0]?.[3]).toEqual({ row: 0, col: 0, formulaResultProvider: provider });
    expect(provider.getFormulaResult).toHaveBeenCalledWith(0, 0);
    expect(create.mock.results[0]?.value.getDisplayText()).toBe('2');
  });
});
