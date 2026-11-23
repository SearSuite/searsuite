import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { SheetRangeMoveRegistry, SheetRangeReorderRegistry } from '@searsuite/sear-assembly-plugin';
import { type SheetEditorConfiguration } from '@searsuite/sear-assembly-setup';
import { MatrixOTActionName } from '@searsuite/sear-domain-ot';
import { createTransaction } from '@searsuite/sear-domain-transaction';
import { SheetCellVisualReaderRegistry } from '@searsuite/sear-render-registry';
import {
  ReadSheetDemoMarkerQuery, SetSheetDemoMarkerCommand,
  SheetDemoMarker, SheetDemoMatrix, SheetDemoPlugin,
} from '../src';

describe('SheetDemoPlugin', () => {
  it('owns a sparse matrix, typed command and query, and visual override', () => {
    const markers = new SheetDemoMatrix(void 0, [3, 3]);
    const plugin = new SheetDemoPlugin({ markers });
    const commands = new SheetCommandBus();
    const queries = new SheetQueryRegistry();
    const visuals = new SheetCellVisualReaderRegistry();
    plugin.registerCommands(commands);
    plugin.registerQueries(queries);
    plugin.registerCellVisualReaders(visuals);
    const configuredPlugins: NonNullable<SheetEditorConfiguration['plugins']> = [SheetDemoPlugin];
    const executePipeline = jest.fn();
    commands.bind({ executePipeline, applyEffect: () => void 0 });

    expect(configuredPlugins).toHaveLength(1);
    expect(commands.has(SetSheetDemoMarkerCommand)).toBe(true);
    commands.run(SetSheetDemoMarkerCommand, { row: 1, column: 1, marker: SheetDemoMarker.Review });
    expect(executePipeline).toHaveBeenCalledTimes(1);
    expect(() => commands.run(SetSheetDemoMarkerCommand, { row: 3, column: 0, marker: null })).toThrow();
    expect(queries.run(ReadSheetDemoMarkerQuery, { row: 1, column: 1 })).toBeNull();
    expect(visuals.read({ rowIndex: 1, columnIndex: 1 })).toEqual({});

    const transaction = createTransaction(plugin.key);
    transaction.addOperation([{
      p: [1, 1],
      [MatrixOTActionName.UpdateCell]: { value: SheetDemoMarker.Review, prev: null },
    } as never]);
    plugin.apply(plugin.getState(), transaction);
    expect(queries.run(ReadSheetDemoMarkerQuery, { row: 1, column: 1 })).toBe(SheetDemoMarker.Review);
    expect(visuals.read({ rowIndex: 1, columnIndex: 1 })).toEqual({ fill: '#FCE3A1' });
    let stored = 0;
    markers.forEachStored(() => { stored += 1; });
    expect(stored).toBe(1);
    expect(() => queries.run(ReadSheetDemoMarkerQuery, { row: 3, column: 0 })).toThrow();
  });

  it('projects row changes and follows atomic range moves and sorting', () => {
    const markers = new SheetDemoMatrix(void 0, [4, 3]);
    markers.setItem(1, 0, SheetDemoMarker.Approved);
    const plugin = new SheetDemoPlugin({ markers });
    const structure = createTransaction({ key: 'sheet.data' });
    structure.addOperation([{ p: [0], [MatrixOTActionName.RowInsert]: [] } as never]);
    plugin.apply(plugin.getState(), structure);
    expect(markers.getItem(2, 0)).toBe(SheetDemoMarker.Approved);

    const moves = new SheetRangeMoveRegistry();
    plugin.registerRangeMoves(moves);
    const context = {
      source: { start: [2, 0], end: [2, 0] } as const,
      destination: { start: [3, 1], end: [3, 1] } as const,
    };
    expect(moves.hasConflict(context)).toBe(false);
    const move = createTransaction(plugin.key);
    move.addOperation([...moves.plan(context)[0].operations]);
    plugin.apply(plugin.getState(), move);
    expect(markers.getItem(2, 0)).toBeNull();
    expect(markers.getItem(3, 1)).toBe(SheetDemoMarker.Approved);

    const reorders = new SheetRangeReorderRegistry();
    plugin.registerRangeReorders(reorders);
    const reorder = createTransaction(plugin.key);
    reorder.addOperation([...reorders.plan({
      range: { start: [2, 0], end: [3, 2] },
      destinationOf: (row) => row === 2 ? 3 : 2,
    })[0].operations]);
    plugin.apply(plugin.getState(), reorder);
    expect(markers.getItem(2, 1)).toBe(SheetDemoMarker.Approved);
    expect(markers.getItem(3, 1)).toBeNull();
  });

  it('captures an independent document-state module and validates restored values', () => {
    const markers = new SheetDemoMatrix(void 0, [2, 2]);
    markers.setItem(0, 1, SheetDemoMarker.Review);
    const contribution = SheetDemoPlugin.documentState;
    const captured = contribution.capture?.({ markers });
    expect(captured?.markers).not.toBe(markers);
    const payload = contribution.codec.serialize({ markers });
    const restored = contribution.codec.deserialize(payload, 'sheet.demo');
    if (!restored.markers) throw new Error('Expected restored demo markers.');
    expect(restored.markers.getItem(0, 1)).toBe(SheetDemoMarker.Review);
    expect(restored.markers.getItem(1, 1)).toBeNull();
    expect(() => markers.setItem(0, 0, 'invalid' as never)).toThrow();
  });
});
