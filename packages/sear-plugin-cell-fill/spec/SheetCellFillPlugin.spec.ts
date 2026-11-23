import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { MatrixOTActionName } from '@searsuite/sear-domain-ot';
import { createTransaction, Transaction } from '@searsuite/sear-domain-transaction';
import { SheetCellVisualReaderRegistry } from '@searsuite/sear-render-registry';
import {
  CellFillMatrix,
  SetRangeCellFillCommand,
  SheetCellFillPlugin,
  SheetCellFill,
  createSetRangeCellFillOperations,
} from '../src';

describe('@searsuite/sear-plugin-cell-fill', () => {
  it('stores explicit hexadecimal fills sparsely and clears them with null', () => {
    const fills = new CellFillMatrix(void 0, [2, 3]);
    fills.addItem(0, 1, '#ffcc00' as SheetCellFill);
    expect(fills.getItem(0, 0)).toBeNull();
    expect(fills.getItem(0, 1)).toBe('#ffcc00');
    fills.setItem(0, 1, null);
    expect(fills.getItem(0, 1)).toBeNull();
    expect(() => fills.addItem(0, 0, 'yellow' as never)).toThrow(
      'Sheet cell fill must be a hexadecimal color such as #ffffff.',
    );
  });

  it('creates typed range operations and registers its command', () => {
    const fills = new CellFillMatrix(void 0, [2, 2]);
    const source = {
      target: SheetCellFillPlugin.pluginKey,
      getRowCount: () => 2,
      getColumnCount: () => 2,
      readCellFill: (row: number, column: number) => fills.getItem(row, column),
    };
    const operations = createSetRangeCellFillOperations(
      { anchor: [0, 0], focus: [1, 1], fill: '#e6f0ff' as SheetCellFill },
      source,
    );
    expect(operations).toHaveLength(4);
    expect(operations[0]).toEqual({
      p: [0, 0],
      [MatrixOTActionName.UpdateCell]: { value: '#e6f0ff', prev: null },
    });
    const commands = new SheetCommandBus();
    const plugin = new SheetCellFillPlugin({ cellFills: fills });
    plugin.registerCommands(commands);
    expect(commands.has(SetRangeCellFillCommand)).toBe(true);
  });

  it('applies direct operations and row projections through the plugin owner', () => {
    const plugin = new SheetCellFillPlugin({ cellFills: new CellFillMatrix(void 0, [2, 2]) });
    const state = plugin.getState();
    state.cellFills.addItem(0, 0, '#ff0000' as SheetCellFill);
    const direct = createTransaction(SheetCellFillPlugin.pluginKey);
    direct.addOperation([{ p: [0, 0], [MatrixOTActionName.UpdateCell]: { value: null } } as never]);
    plugin.apply(state, direct);
    expect(state.cellFills.getItem(0, 0)).toBeNull();

    state.cellFills.addItem(1, 1, '#00a870' as SheetCellFill);
    const structure = createTransaction({ key: 'sheet.data' });
    structure.addOperation([{ p: [0], [MatrixOTActionName.RowInsert]: [] } as never]);
    plugin.apply(state, structure);
    expect(state.cellFills.getItem(2, 1)).toBe('#00a870');
  });

  it('contributes only explicit fills through the visual reader registry', () => {
    const fills = new CellFillMatrix(void 0, [2, 2]);
    fills.addItem(1, 0, '#ffcc00' as SheetCellFill);
    const plugin = new SheetCellFillPlugin({ cellFills: fills });
    const registry = new SheetCellVisualReaderRegistry();

    plugin.registerCellVisualReaders(registry);

    expect(registry.read({ rowIndex: 0, columnIndex: 0 })).toEqual({});
    expect(registry.read({ rowIndex: 1, columnIndex: 0 })).toEqual({ fill: '#ffcc00' });
  });
});
