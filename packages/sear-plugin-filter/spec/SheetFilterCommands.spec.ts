import { SheetCommandBus, SheetQueryRegistry } from '@searsuite/sear-assembly-commands';
import { PipelineStepKind } from '@searsuite/sear-assembly-plugin';
import { CSRMatrix } from '@searsuite/sear-domain-matrix';
import {
  ClearSheetFilterCommand,
  CreateSheetFilterCommand,
  CreateSheetFilterViewCommand,
  ReadSheetFilterQuery,
  ReadSheetFilterValuesQuery,
  ReapplySheetFilterCommand,
  SetSheetColumnFilterCommand,
  SetSheetColumnFiltersCommand,
  SheetFilterKind,
  SheetFilterMatrix,
  SheetFilterPlugin,
} from '../src';

const range = { start: [0, 0] as const, end: [3, 1] as const };
const platform = { toLowerCase: (value: string) => value.toLowerCase() };

function createFixture(readDisplayValue?: (row: number, column: number, value: unknown) => string) {
  const cells = new CSRMatrix<string>(void 0, [4, 2]);
  cells.addItem(0, 0, 'Name');
  cells.addItem(1, 0, 'Ada');
  cells.addItem(2, 0, 'Bob');
  const plugin = new SheetFilterPlugin(
    { filters: new SheetFilterMatrix() },
    {
      readShape: () => [4, 2],
      readValue: (row, column) => cells.getItem(row, column),
      ...(readDisplayValue ? { readDisplayValue } : {}),
      forEachStoredInRange: (first, column, last, visit) =>
        cells.forEachStoredInRange(first, column, last, column, (_value, row) => visit(row)),
      readColor: () => null,
      platform,
    },
  );
  const commands = new SheetCommandBus();
  const queries = new SheetQueryRegistry();
  commands.bind({
    executePipeline: (pipeline) => {
      const committed = [] as NonNullable<(typeof pipeline.steps)[number]['transaction']>[];
      const postCommit = [] as Array<() => void>;
      for (const step of pipeline.steps) {
        if (step.kind === PipelineStepKind.Transaction && step.transaction) {
          plugin.apply(plugin.getState(), step.transaction);
          committed.push(step.transaction);
        }
        if (step.kind === PipelineStepKind.LocalAction) step.localAction?.();
        if (step.kind === PipelineStepKind.PostCommit && step.postCommit) postCommit.push(step.postCommit);
      }
      postCommit.forEach((publish) => publish());
      committed.forEach((transaction) => plugin.onTransactionCommitted(transaction));
    },
    applyEffect: () => {},
  });
  plugin.registerCommands(commands);
  plugin.registerQueries(queries);
  return { commands, queries, plugin, cells };
}

describe('Sheet filter commands', () => {
  it('lists values and blank counts only from rows allowed by other columns', () => {
    const { commands, queries, cells } = createFixture();
    cells.addItem(1, 1, '1');
    cells.addItem(2, 1, '2');
    commands.run(CreateSheetFilterCommand, { range });
    commands.run(SetSheetColumnFilterCommand, {
      column: 0,
      predicate: { kind: SheetFilterKind.Values, values: ['Ada'] },
    });
    expect(queries.run(ReadSheetFilterValuesQuery, { column: 1 }).items).toEqual([{ value: '1', count: 1 }]);
    commands.run(SetSheetColumnFilterCommand, {
      column: 0,
      predicate: { kind: SheetFilterKind.Values, values: ['Ada', ''] },
    });
    commands.run(SetSheetColumnFilterCommand, {
      column: 1,
      predicate: { kind: SheetFilterKind.Values, values: ['2'] },
    });
    expect(queries.run(ReadSheetFilterValuesQuery, { column: 1 }).items).toEqual([
      { value: '1', count: 1 },
      { value: '', count: 1 },
    ]);
  });

  it('updates several columns together and rejects an invalid batch without changing rules', () => {
    const { commands, queries, plugin, cells } = createFixture();
    cells.addItem(1, 1, '1');
    cells.addItem(2, 1, '2');
    commands.run(CreateSheetFilterCommand, { range });
    const updates = [
      { column: 0, predicate: { kind: SheetFilterKind.Values, values: ['Ada'] } },
      { column: 1, predicate: { kind: SheetFilterKind.Values, values: ['1'] } },
    ] as const;
    commands.run(SetSheetColumnFiltersCommand, { updates });
    expect(queries.run(ReadSheetFilterQuery, void 0)?.rules).toEqual(
      updates.map(({ column, predicate }) => ({
        column,
        predicate,
      })),
    );
    expect(plugin.isRowFiltered(1)).toBe(false);
    expect(plugin.isRowFiltered(2)).toBe(true);
    expect(() => commands.run(SetSheetColumnFiltersCommand, { updates: [updates[0], updates[0]] })).toThrow();
    expect(queries.run(ReadSheetFilterQuery, void 0)?.rules).toHaveLength(2);
  });
  it('searches formatted labels while keeping the underlying value as the filter key', () => {
    const { commands, queries, plugin } = createFixture((_row, _column, value) =>
      value === 'Ada' ? '2026-1-2' : String(value ?? ''),
    );
    commands.run(CreateSheetFilterCommand, { range });
    expect(queries.run(ReadSheetFilterValuesQuery, { column: 0, search: '2026-1-2' }).items).toEqual([
      { value: 'Ada', label: '2026-1-2', count: 1 },
    ]);
    commands.run(SetSheetColumnFilterCommand, {
      column: 0,
      predicate: { kind: SheetFilterKind.Values, values: ['Ada'] },
    });
    expect(plugin.isRowFiltered(1)).toBe(false);
    expect(plugin.isRowFiltered(2)).toBe(true);
  });

  it('creates, updates, reapplies and clears a document filter', () => {
    const { commands, queries, plugin } = createFixture();
    commands.run(CreateSheetFilterCommand, { range });
    expect(queries.run(ReadSheetFilterQuery, void 0)).toMatchObject({
      range,
      rules: [],
      firstRowIsHeader: true,
      privateView: false,
    });
    commands.run(SetSheetColumnFilterCommand, {
      column: 0,
      predicate: { kind: SheetFilterKind.Values, values: ['Ada'] },
    });
    expect(plugin.isRowFiltered(1)).toBe(false);
    expect(plugin.isRowFiltered(2)).toBe(true);
    commands.run(ReapplySheetFilterCommand, void 0);
    expect(plugin.isRowFiltered(2)).toBe(true);
    commands.run(ClearSheetFilterCommand, void 0);
    expect(queries.run(ReadSheetFilterQuery, void 0)).toBeNull();
    expect(plugin.isRowFiltered(2)).toBe(false);
  });

  it('keeps a private view separate from shared rules and restores them on clear', () => {
    const { commands, queries, plugin } = createFixture();
    commands.run(CreateSheetFilterCommand, { range, firstRowIsHeader: false });
    commands.run(SetSheetColumnFilterCommand, {
      column: 0,
      predicate: { kind: SheetFilterKind.Values, values: ['Ada'] },
    });
    commands.run(CreateSheetFilterViewCommand, { range });
    expect(queries.run(ReadSheetFilterQuery, void 0)?.privateView).toBe(true);
    commands.run(SetSheetColumnFilterCommand, {
      column: 0,
      predicate: { kind: SheetFilterKind.Values, values: ['Bob'] },
    });
    expect(plugin.isRowFiltered(1)).toBe(true);
    expect(plugin.isRowFiltered(2)).toBe(false);
    commands.run(ReapplySheetFilterCommand, void 0);
    expect(plugin.isRowFiltered(1)).toBe(true);
    commands.run(ClearSheetFilterCommand, void 0);
    expect(queries.run(ReadSheetFilterQuery, void 0)?.privateView).toBe(false);
    expect(plugin.isRowFiltered(1)).toBe(false);
    expect(plugin.isRowFiltered(2)).toBe(true);
  });

  it('rejects invalid ranges, columns and predicates before applying them', () => {
    const { commands, queries } = createFixture();
    for (const invalid of [
      { start: [-1, 0] as const, end: [2, 1] as const },
      { start: [2, 1] as const, end: [1, 1] as const },
      { start: [0, 0] as const, end: [4, 1] as const },
    ])
      expect(() => commands.run(CreateSheetFilterCommand, { range: invalid })).toThrow();
    expect(() =>
      commands.run(SetSheetColumnFilterCommand, {
        column: 0,
        predicate: { kind: SheetFilterKind.Values, values: ['Ada'] },
      }),
    ).toThrow();
    commands.run(CreateSheetFilterCommand, { range });
    expect(() =>
      commands.run(SetSheetColumnFilterCommand, {
        column: 2,
        predicate: { kind: SheetFilterKind.Values, values: ['Ada'] },
      }),
    ).toThrow();
    expect(() =>
      commands.run(SetSheetColumnFilterCommand, {
        column: 0,
        predicate: { kind: SheetFilterKind.Values, values: [1] } as never,
      }),
    ).toThrow();
    expect(queries.run(ReadSheetFilterQuery, void 0)?.rules).toEqual([]);
  });
});
