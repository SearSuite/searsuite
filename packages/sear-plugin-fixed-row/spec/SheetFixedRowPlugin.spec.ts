import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { SheetDataEngine } from '@searsuite/sear-render-engine';
import { MatrixOTActionName } from '@searsuite/sear-domain-ot';
import { createTransaction, Transaction } from '@searsuite/sear-domain-transaction';
import {
  FixedRowMatrix,
  SetSheetRowsFixedCommand,
  SheetFixedRowPlugin,
  createSetSheetRowsFixedOperations,
  readSheetFixedRows,
} from '../src';

describe('@searsuite/sear-plugin-fixed-row', () => {
  it('stores only explicitly fixed rows in its one-dimensional sparse matrix', () => {
    const fixedRows = new FixedRowMatrix(void 0, [1, 5]);
    expect(fixedRows.getItem(0, 2)).toBeNull();
    fixedRows.addItem(0, 2, true);
    expect(fixedRows.getItem(0, 2)).toBe(true);
    fixedRows.setItem(0, 2, null);
    expect(fixedRows.getItem(0, 2)).toBeNull();
  });

  it('creates invertible range operations, skips unchanged rows, and registers its command', () => {
    const fixedRows = new FixedRowMatrix(void 0, [1, 5]);
    fixedRows.addItem(0, 1, true);
    const source = {
      target: SheetFixedRowPlugin.pluginKey,
      getRowCount: () => 5,
      isRowFixed: (index: number) => fixedRows.getItem(0, index) === true,
    };

    expect(createSetSheetRowsFixedOperations({ index: 0, count: 3, fixed: true }, source)).toEqual([
      { p: [0, 0], [MatrixOTActionName.UpdateCell]: { value: true, prev: null } },
      { p: [0, 2], [MatrixOTActionName.UpdateCell]: { value: true, prev: null } },
    ]);
    expect(createSetSheetRowsFixedOperations({ index: 1, fixed: false }, source)).toEqual([
      { p: [0, 1], [MatrixOTActionName.UpdateCell]: { value: null, prev: true } },
    ]);
    expect(() => createSetSheetRowsFixedOperations({ index: -1, fixed: true }, source)).toThrow(RangeError);
    expect(() => createSetSheetRowsFixedOperations({ index: 4, count: 2, fixed: true }, source)).toThrow(
      RangeError,
    );

    const commands = new SheetCommandBus();
    new SheetFixedRowPlugin({ fixedRows }).registerCommands(commands);
    expect(commands.has(SetSheetRowsFixedCommand)).toBe(true);
  });

  it('applies direct updates and follows row insert, delete, and move operations', () => {
    const fixedRows = new FixedRowMatrix(void 0, [1, 4]);
    const plugin = new SheetFixedRowPlugin({ fixedRows });
    const direct = createTransaction(SheetFixedRowPlugin.pluginKey);
    direct.addOperation([
      { p: [0, 1], [MatrixOTActionName.UpdateCell]: { value: true, prev: null } } as never,
      { p: [0, 3], [MatrixOTActionName.UpdateCell]: { value: true, prev: null } } as never,
    ]);
    expect(plugin.apply(plugin.getState(), direct)).toBe(plugin.getState());
    expect([0, 1, 2, 3].map((row) => fixedRows.getItem(0, row) === true)).toEqual([false, true, false, true]);

    const insert = createTransaction({ key: 'sheet.data' });
    insert.addOperation([{ p: [1], [MatrixOTActionName.RowInsert]: [] } as never]);
    plugin.apply(plugin.getState(), insert);
    expect([0, 1, 2, 3, 4].map((row) => fixedRows.getItem(0, row) === true)).toEqual([
      false,
      false,
      true,
      false,
      true,
    ]);

    const remove = createTransaction({ key: 'sheet.data' });
    remove.addOperation([{ p: [2], [MatrixOTActionName.RowDelete]: [] } as never]);
    plugin.apply(plugin.getState(), remove);
    expect([0, 1, 2, 3].map((row) => fixedRows.getItem(0, row) === true)).toEqual([false, false, false, true]);

    const move = createTransaction({ key: 'sheet.data' });
    move.addOperation([{ p: [3], [MatrixOTActionName.RowMove]: [0] } as never]);
    plugin.apply(plugin.getState(), move);
    expect([0, 1, 2, 3].map((row) => fixedRows.getItem(0, row) === true)).toEqual([true, false, false, false]);
  });

  it('publishes a typed field and declares collaborative MatrixOT ownership', () => {
    const fixedRows = new FixedRowMatrix(void 0, [1, 3]);
    const plugin = new SheetFixedRowPlugin({ fixedRows });
    const dataEngine = new SheetDataEngine();
    const registration = plugin.registerState();
    dataEngine.registerDataType(registration.key, registration.state, registration.dataEngine);

    expect(readSheetFixedRows(dataEngine)).toBe(fixedRows);
    expect(plugin.transactionOT).toMatchObject({ ownerId: 'sheet.fixedRow', collaborative: true });
    expect(plugin.interestedIn).toEqual([
      MatrixOTActionName.UpdateCell,
      MatrixOTActionName.RowInsert,
      MatrixOTActionName.RowDelete,
      MatrixOTActionName.RowMove,
    ]);
  });

  it('serializes and restores its sparse document state', () => {
    const fixedRows = new FixedRowMatrix(void 0, [1, 4]);
    fixedRows.addItem(0, 2, true);
    const contribution = SheetFixedRowPlugin.documentState;
    const encoded = contribution.codec.serialize({ fixedRows });
    const decoded = contribution.codec.deserialize(encoded, 'sheet.fixedRows');

    expect(decoded.fixedRows).toBeInstanceOf(FixedRowMatrix);
    expect(decoded.fixedRows?.shape).toEqual([1, 4]);
    expect(decoded.fixedRows?.getItem(0, 2)).toBe(true);
  });

  it('builds a 100k-row fixed range within the performance budget', () => {
    const fixedRows = new FixedRowMatrix(void 0, [1, 100_000]);
    const startedAt = performance.now();
    const operations = createSetSheetRowsFixedOperations(
      { index: 0, count: 100_000, fixed: true },
      {
        target: SheetFixedRowPlugin.pluginKey,
        getRowCount: () => 100_000,
        isRowFixed: (index) => fixedRows.getItem(0, index) === true,
      },
    );
    const elapsed = performance.now() - startedAt;

    expect(operations).toHaveLength(100_000);
    expect(elapsed).toBeLessThan(1_500);
  });
});
