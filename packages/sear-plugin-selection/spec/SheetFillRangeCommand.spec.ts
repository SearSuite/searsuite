import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { SheetFormatTransferRegistry } from '@searsuite/sear-assembly-plugin';
import { CellClipboardCodecRegistry, SheetCellInputValidationRegistry, type CellMatrixElement } from '@searsuite/sear-domain-cell-types';
import { MatrixOTActionName } from '@searsuite/sear-domain-ot';
import { ReadSheetCellDataQuery } from '@searsuite/sear-render-engine';
import { CellMergeMatrix } from '@searsuite/sear-plugin-cell-merge';
import { FillSheetRangeCommand } from '../src';
import { registerSheetFillRangeCommand } from '../src/SheetFillRangeCommand';

describe('FillSheetRangeCommand', () => {
  it('R2-001 advances a single formatted date and preserves exact-copy mode', () => {
    const cells = new Map<string, CellMatrixElement>([['0,0', { type: 'number', value: 45292 }]]);
    const queries = new SheetQueryRegistry();
    queries.register(ReadSheetCellDataQuery, () => ({
      shape: [10, 10],
      getItem: (row, col) => cells.get(`${row},${col}`) ?? null,
    }));
    const formats = new SheetFormatTransferRegistry();
    formats.register({ id: 'date', singleCellFillStep: (row, col) => row === 0 && col === 0 ? 1 : null });
    const commands = new SheetCommandBus();
    registerSheetFillRangeCommand(commands, queries, new SheetCellInputValidationRegistry(),
      new CellClipboardCodecRegistry(), undefined, undefined, formats);
    commands.bind({
      executePipeline: (pipeline) => {
        for (const step of pipeline.steps) {
          for (const operation of step.transaction?.operations ?? []) {
            const update = (operation as unknown as Record<MatrixOTActionName.UpdateCell,
              { value: CellMatrixElement | null }>)[MatrixOTActionName.UpdateCell];
            const key = `${operation.p[0]},${operation.p[1]}`;
            if (update.value) cells.set(key, update.value);
            else cells.delete(key);
          }
        }
      },
      applyEffect: () => void 0,
    });

    commands.run(FillSheetRangeCommand, { source: { start: [0, 0], end: [0, 0] }, target: [4, 0] });
    expect(Array.from({ length: 5 }, (_, row) => cells.get(`${row},0`)?.value))
      .toEqual([45292, 45293, 45294, 45295, 45296]);
    commands.run(FillSheetRangeCommand, {
      source: { start: [0, 0], end: [0, 0] }, target: [0, 1], mode: 'exact',
    });
    expect(cells.get('0,1')?.value).toBe(45292);
  });

  it('rejects an invalid fill atomically and permits a later valid fill', () => {
    const cells = new Map<string, CellMatrixElement>([['59,4', { type: 'number', value: 100 }]]);
    const queries = new SheetQueryRegistry();
    queries.register(ReadSheetCellDataQuery, () => ({
      shape: [100, 10],
      getItem: (row, col) => cells.get(`${row},${col}`) ?? null,
    }));
    const validation = new SheetCellInputValidationRegistry();
    validation.register('number-rule', (row, col, text) => row === 59 && col === 5 && text !== '1'
      ? { valid: false, reject: true, ruleId: 'rule-1', message: 'Expected 1' }
      : { valid: true, reject: false });
    const commands = new SheetCommandBus();
    registerSheetFillRangeCommand(commands, queries, validation, new CellClipboardCodecRegistry());
    const executePipeline = jest.fn((pipeline) => {
      for (const step of pipeline.steps) {
        for (const operation of step.transaction?.operations ?? []) {
          const update = operation[MatrixOTActionName.UpdateCell] as { value: CellMatrixElement | null };
          const key = `${operation.p[0]},${operation.p[1]}`;
          if (update.value) cells.set(key, update.value);
          else cells.delete(key);
        }
      }
    });
    commands.bind({ executePipeline, applyEffect: () => void 0 });
    const input = { source: { start: [59, 4] as const, end: [59, 4] as const }, target: [59, 5] as const };

    expect(() => commands.run(FillSheetRangeCommand, input)).toThrow('Expected 1');
    expect(executePipeline).not.toHaveBeenCalled();
    expect(cells.get('59,5')).toBeUndefined();

    cells.set('59,4', { type: 'number', value: 1 });
    commands.run(FillSheetRangeCommand, input);
    expect(cells.get('59,5')).toEqual({ type: 'number', value: 1 });
    expect(executePipeline).toHaveBeenCalledTimes(1);
  });

  it('BUG-1147 rejects filling through a merge before writing cells', () => {
    const merges = new CellMergeMatrix(void 0, [100, 10]);
    merges.setItem(19, 5, { endRow: 19, endColumn: 6 });
    const queries = new SheetQueryRegistry();
    queries.register(ReadSheetCellDataQuery, () => ({
      shape: [100, 10],
      getItem: (row, col) => row === 19 && col === 5 ? { type: 'text', value: 'MERGED' } : null,
    }));
    const commands = new SheetCommandBus();
    registerSheetFillRangeCommand(commands, queries, new SheetCellInputValidationRegistry(),
      new CellClipboardCodecRegistry(), () => merges);
    const executePipeline = jest.fn();
    commands.bind({ executePipeline, applyEffect: () => void 0 });
    const input = { source: { start: [19, 5] as const, end: [19, 6] as const }, target: [21, 6] as const };

    expect(() => commands.run(FillSheetRangeCommand, input)).toThrow('Cannot fill a range containing merged cells.');
    expect(executePipeline).not.toHaveBeenCalled();

    merges.setItem(19, 5, null);
    commands.run(FillSheetRangeCommand, input);
    expect(executePipeline).toHaveBeenCalledTimes(1);
  });

  it('BUG-1152 INT15-018 fills visible rows without changing filtered rows', () => {
    const cells = new Map<string, CellMatrixElement>([
      ['1,1', { type: 'number', value: 10 }],
      ['2,1', { type: 'number', value: 20 }],
      ['3,1', { type: 'number', value: 30 }],
    ]);
    const queries = new SheetQueryRegistry();
    queries.register(ReadSheetCellDataQuery, () => ({
      shape: [100, 10],
      getItem: (row, col) => cells.get(`${row},${col}`) ?? null,
    }));
    const commands = new SheetCommandBus();
    registerSheetFillRangeCommand(commands, queries, new SheetCellInputValidationRegistry(),
      new CellClipboardCodecRegistry(), undefined,
      () => ({ active: true, version: 1, isRowFiltered: (row: number) => row === 2 }));
    const executePipeline = jest.fn((pipeline) => {
      for (const step of pipeline.steps) {
        for (const operation of step.transaction?.operations ?? []) {
          const update = operation[MatrixOTActionName.UpdateCell] as { value: CellMatrixElement | null };
          const key = `${operation.p[0]},${operation.p[1]}`;
          if (update.value) cells.set(key, update.value);
          else cells.delete(key);
        }
      }
    });
    commands.bind({ executePipeline, applyEffect: () => void 0 });

    commands.run(FillSheetRangeCommand, {
      source: { start: [1, 1], end: [1, 1] }, target: [3, 1],
    });

    expect(cells.get('2,1')).toEqual({ type: 'number', value: 20 });
    expect(cells.get('3,1')).toEqual({ type: 'number', value: 10 });
    expect(executePipeline.mock.calls[0][0].steps[0].transaction.operations).toHaveLength(1);
  });
});
