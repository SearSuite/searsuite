import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { CellFormats } from '@searsuite/sear-domain-cell-types';
import { MatrixOTActionName } from '@searsuite/sear-domain-ot';
import { createTransaction } from '@searsuite/sear-domain-transaction';
import { SheetCellVisualReaderRegistry } from '@searsuite/sear-render-registry';
import {
  AdjustRangeCellFormatDecimalPlacesCommand,
  CellFormatMatrix,
  ReadSheetCellFormatQuery,
  SetRangeCellFormatCommand,
  SheetCellFormatPlugin,
  createAdjustCellFormatDecimalOperations,
  createSetRangeCellFormatOperations,
} from '../src';

describe('@searsuite/sear-plugin-cell-format', () => {
  it('stores explicit formats sparsely and clears them with null', () => {
    const formats = new CellFormatMatrix(void 0, [2, 3]);
    formats.addItem(0, 1, CellFormats.excelCode('#,##0.00'));

    expect(formats.getItem(0, 0)).toBeNull();
    expect(formats.getItem(0, 1)).toEqual(CellFormats.excelCode('#,##0.00'));
    formats.setItem(0, 1, null);
    expect(formats.getItem(0, 1)).toBeNull();
    expect(() => formats.addItem(0, 0, { kind: 'unsupported' } as never)).toThrow(
      'Sheet cell format is not a supported format definition.',
    );
  });

  it('creates typed range operations and registers its command', () => {
    const formats = new CellFormatMatrix(void 0, [2, 2]);
    const source = {
      target: SheetCellFormatPlugin.pluginKey,
      getRowCount: () => 2,
      getColumnCount: () => 2,
      readCellFormat: (row: number, column: number) => formats.getItem(row, column),
    };
    const operations = createSetRangeCellFormatOperations(
      { anchor: [0, 0], focus: [1, 1], format: CellFormats.percent },
      source,
    );

    expect(operations).toHaveLength(4);
    expect(operations[0]).toEqual({
      p: [0, 0],
      [MatrixOTActionName.UpdateCell]: { value: CellFormats.percent, prev: null },
    });
    const commands = new SheetCommandBus();
    const plugin = new SheetCellFormatPlugin({ cellFormats: formats });
    plugin.registerCommands(commands);
    expect(commands.has(SetRangeCellFormatCommand)).toBe(true);
    expect(commands.has(AdjustRangeCellFormatDecimalPlacesCommand)).toBe(true);
  });

  it('creates per-cell decimal adjustment operations from current formats', () => {
    const formats = new CellFormatMatrix(void 0, [1, 2]);
    formats.addItem(0, 1, CellFormats.percent);
    const operations = createAdjustCellFormatDecimalOperations(
      { anchor: [0, 0], focus: [0, 1], delta: 1 },
      {
        target: SheetCellFormatPlugin.pluginKey,
        getRowCount: () => 1,
        getColumnCount: () => 2,
        readCellFormat: (row, column) => formats.getItem(row, column),
      },
    );

    expect(operations.map((operation) => operation[MatrixOTActionName.UpdateCell]?.value)).toEqual([
      { kind: 'number', minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false },
      { kind: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 },
    ]);
  });

  it('BUG-973 emits one operation per cell for disjoint and overlapping format ranges', () => {
    const formats = new CellFormatMatrix(void 0, [3, 2]);
    const operations = createSetRangeCellFormatOperations(
      {
        ranges: [
          { anchor: [0, 1], focus: [0, 1] },
          { anchor: [2, 1], focus: [2, 1] },
          { anchor: [0, 1], focus: [2, 1] },
        ],
        format: CellFormats.percent,
      },
      {
        target: SheetCellFormatPlugin.pluginKey,
        getRowCount: () => 3,
        getColumnCount: () => 2,
        readCellFormat: (row, column) => formats.getItem(row, column),
      },
    );
    expect(operations.map((operation) => operation.p)).toEqual([[0, 1], [2, 1], [1, 1]]);
  });

  it('applies direct operations and follows sheet structure operations', () => {
    const plugin = new SheetCellFormatPlugin({ cellFormats: new CellFormatMatrix(void 0, [2, 2]) });
    const state = plugin.getState();
    state.cellFormats.addItem(0, 0, CellFormats.number);
    const direct = createTransaction(SheetCellFormatPlugin.pluginKey);
    direct.addOperation([{ p: [0, 0], [MatrixOTActionName.UpdateCell]: { value: CellFormats.percent } } as never]);
    plugin.apply(state, direct);
    expect(state.cellFormats.getItem(0, 0)).toEqual(CellFormats.percent);

    state.cellFormats.addItem(1, 1, CellFormats.currency('USD', 'en-US'));
    const structure = createTransaction({ key: 'sheet.data' });
    structure.addOperation([{ p: [0], [MatrixOTActionName.RowInsert]: [] } as never]);
    plugin.apply(state, structure);
    expect(state.cellFormats.getItem(2, 1)).toEqual(CellFormats.currency('USD', 'en-US'));
  });

  it('publishes visual and query projections without exposing mutation commands', () => {
    const formats = new CellFormatMatrix(void 0, [2, 2]);
    formats.addItem(1, 0, CellFormats.date);
    const plugin = new SheetCellFormatPlugin({ cellFormats: formats });
    const visualReaders = new SheetCellVisualReaderRegistry();
    const queries = new SheetQueryRegistry();

    plugin.registerCellVisualReaders(visualReaders);
    plugin.registerQueries(queries);

    expect(visualReaders.read({ rowIndex: 0, columnIndex: 0 })).toEqual({});
    expect(visualReaders.read({ rowIndex: 1, columnIndex: 0 })).toEqual({ format: CellFormats.date });
    expect(queries.run(ReadSheetCellFormatQuery, void 0).getItem(1, 0)).toEqual(CellFormats.date);
  });
});
