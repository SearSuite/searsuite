import { PluginKey, SheetStructureMoveRegistry } from '@searsuite/sear-assembly-plugin';
import { type Pipeline } from '@searsuite/sear-assembly-plugin';
import { MatrixOTActionName } from '@searsuite/sear-domain-ot';
import {
  ClearRangeContentsCommand,
  DeleteColumnCommand,
  DeleteRowCommand,
  InsertColumnCommand,
  InsertRowCommand,
  SheetCommandBus,
  createClearRangeContentsOperations,
  createDeleteColumnOperations,
  createDeleteRowOperations,
  createInsertColumnOperations,
  createInsertRowOperations,
  registerSheetStructureCommands,
  type SheetStructureCommandDataSource,
} from '../src';

describe('SheetOperationCommands', () => {
  it('exposes official row and column structure command definitions', () => {
    expect(InsertRowCommand.id).toBe('sheet.insertRows');
    expect(InsertColumnCommand.id).toBe('sheet.insertColumns');
    expect(DeleteRowCommand.id).toBe('sheet.deleteRows');
    expect(DeleteColumnCommand.id).toBe('sheet.deleteColumns');
  });

  it('exposes official range editing command definitions', () => {
    expect(ClearRangeContentsCommand.id).toBe('range.clearContents');
  });

  it('creates insert operations from public structure command input', () => {
    expect(createInsertRowOperations({ index: 2, count: 2 }, { getColumnCount: () => 3 })).toEqual([
      { p: [2], [MatrixOTActionName.RowInsert]: [null, null, null] },
      { p: [2], [MatrixOTActionName.RowInsert]: [null, null, null] },
    ]);
    expect(createInsertColumnOperations({ index: 1 }, { getRowCount: () => 2 })).toEqual([
      { p: [1], [MatrixOTActionName.ColInsert]: [null, null] },
    ]);
  });

  it('creates reverse-order delete operations with invertible payloads', () => {
    const rows = [
      ['A1', null],
      ['A2', 'B2'],
      [null, 'B3'],
    ];
    const columns = [
      ['A1', 'A2', null],
      [null, 'B2', 'B3'],
    ];

    expect(
      createDeleteRowOperations(
        { index: 1, count: 2 },
        {
          getRowCount: () => rows.length,
          readRow: (index) => rows[index] ?? [],
        },
      ),
    ).toEqual([
      { p: [2], [MatrixOTActionName.RowDelete]: [null, 'B3'] },
      { p: [1], [MatrixOTActionName.RowDelete]: ['A2', 'B2'] },
    ]);
    expect(
      createDeleteColumnOperations(
        { index: 0, count: 2 },
        {
          getColumnCount: () => columns.length,
          readColumn: (index) => columns[index] ?? [],
        },
      ),
    ).toEqual([
      { p: [1], [MatrixOTActionName.ColDelete]: [null, 'B2', 'B3'] },
      { p: [0], [MatrixOTActionName.ColDelete]: ['A1', 'A2', null] },
    ]);
  });

  it('validates structure command index, count, and delete bounds', () => {
    expect(() => createInsertRowOperations({ index: -1 }, { getColumnCount: () => 1 })).toThrow(
      'row insert index must be a non-negative integer.',
    );
    expect(() => createInsertColumnOperations({ index: 0, count: 0 }, { getRowCount: () => 1 })).toThrow(
      'sheet structure command count must be a positive integer.',
    );
    expect(() =>
      createDeleteRowOperations({ index: 1, count: 2 }, { getRowCount: () => 2, readRow: () => [] }),
    ).toThrow('row delete range exceeds current sheet bounds.');
    expect(() => createDeleteColumnOperations({ index: 2 }, { getColumnCount: () => 2, readColumn: () => [] })).toThrow(
      'column delete range exceeds current sheet bounds.',
    );
  });

  it('registers structure commands on the sheet command bus', () => {
    const target = new PluginKey('sheet-data');
    const executePipeline = jest.fn();
    const commands = new SheetCommandBus();
    const dataSource: SheetStructureCommandDataSource<string> = {
      target,
      getRowCount: () => 3,
      getColumnCount: () => 2,
      readRow: (index) => [`R${index}C0`, `R${index}C1`],
      readColumn: (index) => [`R0C${index}`, `R1C${index}`, `R2C${index}`],
    };

    commands.bind({ executePipeline, applyEffect: () => void 0 });
    registerSheetStructureCommands(commands, dataSource);
    commands.run(DeleteColumnCommand, { index: 1 });

    expect(commands.getRegisteredCommandIds()).toEqual([
      'sheet.deleteColumns',
      'sheet.deleteRows',
      'sheet.insertColumns',
      'sheet.insertRows',
      'sheet.moveColumns',
      'sheet.moveRows',
    ]);
    const pipeline = executePipeline.mock.calls[0]?.[0] as Pipeline;
    expect(pipeline.name).toBe(DeleteColumnCommand.id);
    expect(pipeline.steps[0]?.transaction?.pluginKey).toBe(target);
    expect(pipeline.steps[0]?.transaction?.operations).toEqual([
      { p: [1], [MatrixOTActionName.ColDelete]: ['R0C1', 'R1C1', 'R2C1'] },
    ]);
  });

  it('plans row and column insertions and deletions through structure contributions', () => {
    const target = new PluginKey('sheet-data');
    const commands = new SheetCommandBus();
    const moves = new SheetStructureMoveRegistry();
    const transformOperations = jest.fn(({ operations }) => operations);
    moves.register({ id: 'test.formula.references', transformOperations });
    commands.bind({ executePipeline: jest.fn(), applyEffect: () => void 0 });
    registerSheetStructureCommands(
      commands,
      {
        target,
        getRowCount: () => 3,
        getColumnCount: () => 2,
        readRow: () => [null, null],
        readColumn: () => [null, null, null],
      },
      moves,
    );

    commands.run(InsertRowCommand, { index: 1 });
    commands.run(InsertColumnCommand, { index: 1 });
    commands.run(DeleteRowCommand, { index: 1 });
    commands.run(DeleteColumnCommand, { index: 1 });

    expect(transformOperations.mock.calls.map(([context]) => Object.keys(context.operations[0])[1])).toEqual([
      MatrixOTActionName.RowInsert,
      MatrixOTActionName.ColInsert,
      MatrixOTActionName.RowDelete,
      MatrixOTActionName.ColDelete,
    ]);
    expect(transformOperations.mock.calls.every(([context]) => context.target === target)).toBe(true);
  });

  it('creates range clear operations from explicit range input', () => {
    const cells = [
      ['A1', null],
      ['A2', 'B2'],
    ];

    expect(
      createClearRangeContentsOperations(
        { anchor: [1, 1], focus: [0, 0] },
        {
          target: new PluginKey('sheet-data'),
          getRowCount: () => 2,
          getColumnCount: () => 2,
          readCell: (row, column) => cells[row]?.[column] ?? null,
        },
      ),
    ).toEqual([
      { p: [0, 0], [MatrixOTActionName.UpdateCell]: { value: null, prev: 'A1' } },
      { p: [1, 0], [MatrixOTActionName.UpdateCell]: { value: null, prev: 'A2' } },
      { p: [1, 1], [MatrixOTActionName.UpdateCell]: { value: null, prev: 'B2' } },
    ]);
  });

  it('rejects a range clear atomically when an occupied cell is protected', () => {
    const dataSource = {
      target: new PluginKey('sheet-data'),
      getRowCount: () => 2,
      getColumnCount: () => 2,
      readCell: () => 'existing',
      validateClearCell: (row: number, column: number) => ({
        reject: row === 1 && column === 1,
        message: 'protected result',
      }),
    };
    expect(() => createClearRangeContentsOperations({ anchor: [0, 0], focus: [1, 1] }, dataSource)).toThrow(
      'protected result',
    );
    expect(createClearRangeContentsOperations({ anchor: [0, 0], focus: [0, 1] }, dataSource)).toHaveLength(2);
  });

  it('INT15-002 excludes hidden targets before validating range clears', () => {
    const validateClearCell = jest.fn((row: number) => ({ reject: row === 1 }));
    const dataSource = {
      target: new PluginKey('sheet-data'),
      getRowCount: () => 3,
      getColumnCount: () => 1,
      readCell: (row: number) => String(row + 1),
      includeCell: (row: number) => row !== 1,
      validateClearCell,
    };

    expect(
      createClearRangeContentsOperations({ anchor: [0, 0], focus: [2, 0] }, dataSource).map((operation) => operation.p),
    ).toEqual([
      [0, 0],
      [2, 0],
    ]);
    expect(validateClearCell.mock.calls.map(([row]) => row)).toEqual([0, 2]);
  });

  it('validates explicit range command bounds and accepts the empty selection sentinel', () => {
    const dataSource = {
      target: new PluginKey('sheet-data'),
      getRowCount: () => 1,
      getColumnCount: () => 1,
      readCell: () => null,
    };

    expect(createClearRangeContentsOperations({ anchor: [0, 0], focus: [-1, -1] }, dataSource)).toEqual([]);
    expect(() => createClearRangeContentsOperations({ anchor: [0, 0], focus: [1, 0] }, dataSource)).toThrow(
      'range focus is outside current sheet bounds.',
    );
  });
});
