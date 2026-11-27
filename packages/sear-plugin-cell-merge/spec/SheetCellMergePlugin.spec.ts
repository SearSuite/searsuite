import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { MatrixOTActionName } from '@searsuite/sear-domain-ot';
import { createTransaction } from '@searsuite/sear-domain-transaction';
import {
  CellMergeMatrix,
  AnalyzeMergeCellsQuery,
  MergeCellsCommand,
  SheetCellMergeConfirmationError,
  SheetCellMergePlugin,
  ToggleMergeCellsCommand,
  UnmergeCellsCommand,
  createMergeCellsOperations,
} from '../src';

describe('@searsuite/sear-plugin-cell-merge', () => {
  it('stores only merge anchors and resolves cell membership', () => {
    const merges = new CellMergeMatrix(void 0, [4, 4]);
    merges.setItem(1, 1, { endRow: 2, endColumn: 3 });

    expect(merges.getItem(1, 1)).toEqual({ endRow: 2, endColumn: 3 });
    expect(merges.getItem(2, 2)).toBeNull();
    expect(merges.findRange(2, 2)?.shape).toEqual([
      [1, 1],
      [2, 3],
    ]);
    expect(collectStored(merges)).toEqual([{ row: 1, column: 1 }]);
  });

  it('creates merge operations, rejects overlap, and registers plugin commands', () => {
    const merges = new CellMergeMatrix(void 0, [4, 4]);
    const plugin = new SheetCellMergePlugin(
      { cellMerges: merges },
      {
        target: SheetDataPlugin.pluginKey,
        readCell: () => null,
      },
    );
    const source = { target: plugin.key, readMatrix: () => merges };

    expect(createMergeCellsOperations({ anchor: [0, 0], focus: [1, 2] }, source)).toEqual([
      {
        p: [0, 0],
        [MatrixOTActionName.UpdateCell]: {
          value: { endRow: 1, endColumn: 2 },
          prev: null,
        },
      },
    ]);
    merges.setItem(0, 0, { endRow: 1, endColumn: 2 });
    expect(() => createMergeCellsOperations({ anchor: [1, 1], focus: [2, 2] }, source)).toThrow(
      'cannot overlap an existing merged range',
    );

    const commands = new SheetCommandBus();
    plugin.registerCommands(commands);
    expect(commands.has(MergeCellsCommand)).toBe(true);
    expect(commands.has(UnmergeCellsCommand)).toBe(true);
    expect(commands.has(ToggleMergeCellsCommand)).toBe(true);
  });

  it('requires confirmation before discarding non-anchor values and submits both changes together', () => {
    const merges = new CellMergeMatrix(void 0, [2, 2]);
    const anchorValue = { type: 'text', value: 'A1' };
    const value = { type: 'text', value: 'B1' };
    let otherCell: unknown = value;
    const plugin = new SheetCellMergePlugin(
      { cellMerges: merges },
      {
        target: SheetDataPlugin.pluginKey,
        readCell: (row, column) => {
          if (row === 0 && column === 0) return anchorValue;
          return row === 0 && column === 1 ? otherCell : null;
        },
      },
    );
    const commands = new SheetCommandBus();
    const executePipeline = jest.fn();
    commands.bind({ executePipeline, applyEffect: () => void 0 });
    plugin.registerCommands(commands);
    const queries = new SheetQueryRegistry();
    plugin.registerQueries(queries);
    const range = { anchor: [0, 0] as const, focus: [1, 1] as const };

    expect(() => commands.run(MergeCellsCommand, range)).toThrow(SheetCellMergeConfirmationError);
    expect(executePipeline).not.toHaveBeenCalled();
    const analysis = queries.run(AnalyzeMergeCellsQuery, range);
    expect(analysis?.retainedCell).toEqual({ row: 0, column: 0, value: anchorValue });
    expect(analysis?.discardedCells).toEqual([{ row: 0, column: 1, value }]);
    if (!analysis) throw new Error('Expected a merge analysis.');
    commands.run(MergeCellsCommand, { ...range, confirmation: analysis });
    const pipeline = executePipeline.mock.calls[0]?.[0];
    expect(pipeline.steps).toHaveLength(2);
    expect(pipeline.steps[0]?.transaction?.pluginKey).toEqual(SheetDataPlugin.pluginKey);
    expect(pipeline.steps[0]?.transaction?.operations).toEqual([{ p: [0, 1], uc: { value: null, prev: value } }]);
    expect(pipeline.steps[1]?.transaction?.pluginKey).toEqual(plugin.key);

    otherCell = { type: 'text', value: 'changed' };
    expect(() => commands.run(MergeCellsCommand, { ...range, confirmation: analysis })).toThrow(
      SheetCellMergeConfirmationError,
    );
    expect(executePipeline).toHaveBeenCalledTimes(1);
  });

  it('moves the first occupied value into an empty top-left cell without discarding it', () => {
    const merges = new CellMergeMatrix(void 0, [2, 2]);
    const value = { type: 'text', value: 'B1' };
    const plugin = new SheetCellMergePlugin(
      { cellMerges: merges },
      {
        target: SheetDataPlugin.pluginKey,
        readCell: (row, column) => (row === 0 && column === 1 ? value : null),
      },
    );
    const commands = new SheetCommandBus();
    const executePipeline = jest.fn();
    commands.bind({ executePipeline, applyEffect: () => void 0 });
    plugin.registerCommands(commands);
    const queries = new SheetQueryRegistry();
    plugin.registerQueries(queries);
    const range = { anchor: [0, 0] as const, focus: [0, 1] as const };

    expect(queries.run(AnalyzeMergeCellsQuery, range)).toMatchObject({
      retainedCell: { row: 0, column: 1, value },
      discardedCells: [],
    });
    commands.run(MergeCellsCommand, range);
    const pipeline = executePipeline.mock.calls[0]?.[0];
    expect(pipeline.steps[0]?.transaction?.operations).toEqual([
      { p: [0, 1], uc: { value: null, prev: value } },
      { p: [0, 0], uc: { value, prev: null } },
    ]);
    expect(pipeline.steps[1]?.transaction?.pluginKey).toEqual(plugin.key);
  });

  it('applies direct updates and projects row structure operations', () => {
    const plugin = new SheetCellMergePlugin({ cellMerges: new CellMergeMatrix(void 0, [3, 3]) });
    const state = plugin.getState();
    state.cellMerges.setItem(1, 1, { endRow: 2, endColumn: 2 });
    expect(state.cellMerges.findRange(2, 2)).not.toBeNull();

    const structure = createTransaction({ key: 'sheet.data' });
    structure.addOperation([{ p: [0], [MatrixOTActionName.RowInsert]: [null, null, null] } as never]);
    plugin.apply(state, structure);
    expect(state.cellMerges.findRange(1, 1)).toBeNull();
    expect(state.cellMerges.findRange(2, 1)?.shape).toEqual([
      [2, 1],
      [3, 2],
    ]);

    const direct = createTransaction(SheetCellMergePlugin.pluginKey);
    direct.addOperation([
      {
        p: [2, 1],
        [MatrixOTActionName.UpdateCell]: { value: null, prev: { endRow: 3, endColumn: 2 } },
      } as never,
    ]);
    plugin.apply(state, direct);
    expect(state.cellMerges.findRange(2, 1)).toBeNull();
  });

  it('BUG-969 extends a merged range when a row is inserted inside it', () => {
    const plugin = new SheetCellMergePlugin({ cellMerges: new CellMergeMatrix(void 0, [5, 3]) });
    const state = plugin.getState();
    state.cellMerges.setItem(1, 1, { endRow: 2, endColumn: 1 });

    const structure = createTransaction({ key: 'sheet.data' });
    structure.addOperation([{ p: [2], [MatrixOTActionName.RowInsert]: [null, null, null] } as never]);
    plugin.apply(state, structure);

    expect(state.cellMerges.findRange(3, 1)?.shape).toEqual([
      [1, 1],
      [3, 1],
    ]);
    expect(state.cellMerges.findRange(4, 1)).toBeNull();

    const inverse = createTransaction({ key: 'sheet.data' });
    inverse.addOperation([{ p: [2], [MatrixOTActionName.RowDelete]: [null, null, null] } as never]);
    plugin.apply(state, inverse);
    expect(state.cellMerges.findRange(2, 1)?.shape).toEqual([
      [1, 1],
      [2, 1],
    ]);
    expect(state.cellMerges.findRange(3, 1)).toBeNull();
  });
});

function collectStored(matrix: CellMergeMatrix): Array<{ row: number; column: number }> {
  const entries: Array<{ row: number; column: number }> = [];
  matrix.forEachStored((_value, row, column) => {
    entries.push({ row, column });
  });
  return entries;
}
