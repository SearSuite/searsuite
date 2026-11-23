import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { createTransaction } from '@searsuite/sear-domain-transaction';
import { MatrixOTActionName } from '@searsuite/sear-domain-ot';
import { SheetDataEngine } from '@searsuite/sear-render-engine';
import {
  createSetSheetFreezeOperations, readSheetFreeze, SetSheetFreezeCommand,
  SheetFreezeBoundaryError, SheetFreezeMatrix, SheetFreezePlugin,
} from '../src';

describe('@searsuite/sear-plugin-freeze', () => {
  it('registers a typed command and validates complete freeze boundaries', () => {
    const plugin = new SheetFreezePlugin({ freeze: new SheetFreezeMatrix() }, () => [20, 10]);
    const commands = new SheetCommandBus();
    plugin.registerCommands(commands);
    expect(commands.has(SetSheetFreezeCommand)).toBe(true);
    const source = { target: plugin.key, read: () => ({ rows: 2, columns: 1 }), shape: () => [20, 10] as const };
    expect(createSetSheetFreezeOperations({ rows: 3, columns: 0 }, source)).toEqual([
      { p: [0, 0], uc: { value: 3, prev: 2 } },
      { p: [0, 1], uc: { value: null, prev: 1 } },
    ]);
    expect(() => createSetSheetFreezeOperations({ rows: 21, columns: 0 }, source))
      .toThrow(SheetFreezeBoundaryError);
    expect(() => createSetSheetFreezeOperations({ rows: 20, columns: 0 }, source))
      .toThrow(SheetFreezeBoundaryError);
    expect(() => createSetSheetFreezeOperations({ rows: 0, columns: 10 }, source))
      .toThrow(SheetFreezeBoundaryError);
    expect(createSetSheetFreezeOperations({ rows: 19, columns: 9 }, source)).toHaveLength(2);
    for (const input of [
      { rows: -1, columns: 0 }, { rows: 1.5, columns: 0 },
      { rows: 0, columns: -1 }, { rows: 0, columns: 11 }, { rows: 0, columns: 1.5 },
    ]) expect(() => createSetSheetFreezeOperations(input, source)).toThrow(SheetFreezeBoundaryError);
    expect(createSetSheetFreezeOperations({ rows: 2, columns: 1 }, source)).toEqual([]);
    expect(createSetSheetFreezeOperations({ rows: 0, columns: 3 }, source)).toEqual([
      { p: [0, 0], uc: { value: null, prev: 2 } },
      { p: [0, 1], uc: { value: 3, prev: 1 } },
    ]);
    expect(createSetSheetFreezeOperations({ rows: 1, columns: 1 }, {
      ...source, read: () => ({ rows: 0, columns: 0 }),
    })).toEqual([
      { p: [0, 0], uc: { value: 1, prev: null } },
      { p: [0, 1], uc: { value: 1, prev: null } },
    ]);
  });

  it('normalizes empty sparse entries while restoring freeze state', () => {
    const matrix = new SheetFreezeMatrix({ data: [3, 0], indices: [0, 2], indptr: [0, 1] });
    expect(matrix.getItem(0, 0)).toBe(3);
    expect(matrix.getItem(0, 1)).toBeNull();
    matrix.setItem(0, 0, 0);
    expect(matrix.getItem(0, 0)).toBeNull();
    matrix.addItem(0, 1, 2);
    matrix.setItem(0, 1, null);
    expect(matrix.getItem(0, 1)).toBeNull();
  });

  it('projects row and column structure changes into the frozen prefix', () => {
    const freeze = new SheetFreezeMatrix();
    freeze.addItem(0, 0, 3);
    freeze.addItem(0, 1, 2);
    const plugin = new SheetFreezePlugin({ freeze }, () => [20, 10]);
    const insertRow = createTransaction({ key: 'sheet.data' });
    insertRow.addOperation([{ p: [1], [MatrixOTActionName.RowInsert]: [] } as never]);
    plugin.apply(plugin.getState(), insertRow);
    expect(freeze.getItem(0, 0)).toBe(4);

    const deleteColumn = createTransaction({ key: 'sheet.data' });
    deleteColumn.addOperation([{ p: [0], [MatrixOTActionName.ColDelete]: [] } as never]);
    plugin.apply(plugin.getState(), deleteColumn);
    expect(freeze.getItem(0, 1)).toBe(1);

    const moveRow = createTransaction({ key: 'sheet.data' });
    moveRow.addOperation([{ p: [1], [MatrixOTActionName.RowMove]: [7] } as never]);
    plugin.apply(plugin.getState(), moveRow);
    expect(freeze.getItem(0, 0)).toBe(3);
  });

  it('keeps freeze boundaries attached to their rows and columns across moves', () => {
    const freeze = new SheetFreezeMatrix();
    freeze.addItem(0, 0, 3);
    freeze.addItem(0, 1, 2);
    const plugin = new SheetFreezePlugin({ freeze }, () => [20, 10]);
    const apply = (key: Parameters<typeof createTransaction>[0], operation: Record<string, unknown>) => {
      const transaction = createTransaction(key);
      transaction.addOperation([operation as never]);
      plugin.apply(plugin.getState(), transaction);
    };
    const dataKey = { key: 'sheet.data' };

    apply(dataKey, { p: [3], [MatrixOTActionName.RowInsert]: [] });
    expect(readState(freeze)).toEqual({ rows: 3, columns: 2 });
    apply(dataKey, { p: [0], [MatrixOTActionName.ColInsert]: [] });
    expect(readState(freeze)).toEqual({ rows: 3, columns: 3 });
    apply(dataKey, { p: [2], [MatrixOTActionName.RowDelete]: [] });
    expect(readState(freeze)).toEqual({ rows: 2, columns: 3 });
    apply(dataKey, { p: [3], [MatrixOTActionName.ColDelete]: [] });
    expect(readState(freeze)).toEqual({ rows: 2, columns: 3 });
    apply(dataKey, { p: [0], [MatrixOTActionName.RowMove]: [7] });
    expect(readState(freeze)).toEqual({ rows: 1, columns: 3 });
    apply(dataKey, { p: [7], [MatrixOTActionName.RowMove]: [0] });
    expect(readState(freeze)).toEqual({ rows: 2, columns: 3 });
    apply(dataKey, { p: [0], [MatrixOTActionName.ColMove]: [5] });
    expect(readState(freeze)).toEqual({ rows: 2, columns: 2 });
    apply(dataKey, { p: [5], [MatrixOTActionName.ColMove]: [0] });
    expect(readState(freeze)).toEqual({ rows: 2, columns: 3 });

    apply(dataKey, { p: [0, 0], [MatrixOTActionName.UpdateCell]: { value: 9, prev: 2 } });
    expect(readState(freeze)).toEqual({ rows: 2, columns: 3 });
    apply(plugin.key, { p: [0, 0], [MatrixOTActionName.UpdateCell]: { value: 4 } });
    expect(readState(freeze)).toEqual({ rows: 4, columns: 3 });
    apply(plugin.key, { p: [0, 2], [MatrixOTActionName.UpdateCell]: { value: 5 } });
    expect(readState(freeze)).toEqual({ rows: 4, columns: 3 });
    apply(dataKey, { p: [0], unknown: true });
    expect(readState(freeze)).toEqual({ rows: 4, columns: 3 });

    const oneRow = new SheetFreezeMatrix();
    oneRow.addItem(0, 0, 1);
    const oneRowPlugin = new SheetFreezePlugin({ freeze: oneRow }, () => [20, 10]);
    const remove = createTransaction(dataKey);
    remove.addOperation([{ p: [0], [MatrixOTActionName.RowDelete]: [] } as never]);
    oneRowPlugin.apply(oneRowPlugin.getState(), remove);
    expect(readState(oneRow)).toEqual({ rows: 0, columns: 0 });
  });

  it('publishes the freeze field and roundtrips its document state', () => {
    expect(readSheetFreeze(new SheetDataEngine())).toEqual({ rows: 0, columns: 0 });
    const freeze = new SheetFreezeMatrix();
    freeze.addItem(0, 0, 3);
    freeze.addItem(0, 1, 2);
    const plugin = new SheetFreezePlugin({ freeze }, () => [20, 10]);
    const dataEngine = new SheetDataEngine();
    const registration = plugin.registerState();
    dataEngine.registerDataType(registration.key, registration.state, registration.dataEngine);
    expect(readSheetFreeze(dataEngine)).toEqual({ rows: 3, columns: 2 });
    const encoded = SheetFreezePlugin.documentState.codec.serialize({ freeze });
    const decoded = SheetFreezePlugin.documentState.codec.deserialize(encoded, 'sheet.freeze');
    expect(decoded.freeze?.getItem(0, 0)).toBe(3);
    expect(decoded.freeze?.getItem(0, 1)).toBe(2);
    expect(plugin.transactionOT).toMatchObject({ ownerId: 'sheet.freeze', collaborative: true });
    expect(SheetFreezePlugin.documentState.capture({ freeze: null } as never)).toBeUndefined();
    expect(SheetFreezePlugin.documentState.codec.serialize({ freeze: null } as never)).toBeUndefined();
  });
});

function readState(freeze: SheetFreezeMatrix): { rows: number; columns: number } {
  return { rows: freeze.getItem(0, 0) ?? 0, columns: freeze.getItem(0, 1) ?? 0 };
}
