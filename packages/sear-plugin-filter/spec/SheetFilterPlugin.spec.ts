import { registerSheetFilterVisuals } from '@searsuite/sear-render';
import { CSRMatrix, RowShapeDimensionsCSRMatrix } from '@searsuite/sear-domain-matrix';
import {
  defineSheetCommand,
  LocalActionCommand,
  SheetCommandBus,
  SheetQueryRegistry,
} from '@searsuite/sear-assembly-commands';
import { PluginKey, SessionStateRegistry } from '@searsuite/sear-assembly-plugin';
import { SheetDisplayedValueChanges } from '@searsuite/sear-domain-cell-types';
import { createInsertColOTOperation, createUpdateCellOTOperation } from '@searsuite/sear-domain-ot';
import { createTransaction, TRANSACTION_ORIGIN_META_KEY, TransactionOrigin } from '@searsuite/sear-domain-transaction';
import { VisibleRowDimensions } from '@searsuite/sear-domain-sheet';
import { SheetCellVisualReaderRegistry } from '@searsuite/sear-render-registry';
import {
  SheetFilterCategory,
  SheetFilterKind,
  SheetFilterMatrix,
  SheetFilterOperator,
  SheetFilterPlugin,
  ReadSheetFilterValuesQuery,
  CreateSheetFilterViewCommand,
  SetSheetColumnFilterCommand,
  type SheetFilterDefinition,
} from '../src';
import { projectSheetFilterDefinition } from '../src/projectSheetFilterDefinition';

const platform = { toLowerCase: (value: string) => value.toLowerCase() };

function createFixture(rowCount = 6) {
  const cells = new CSRMatrix<string | number | boolean>(void 0, [rowCount, 2]);
  const filters = new SheetFilterMatrix();
  const plugin = new SheetFilterPlugin(
    { filters },
    {
      readShape: () => [rowCount, 2],
      readValue: (row, column) => cells.getItem(row, column),
      forEachStoredInRange: (first, column, last, visit) =>
        cells.forEachStoredInRange(first, column, last, column, (_value, row) => visit(row)),
      readColor: () => null,
      platform,
    },
  );
  const sizes = new RowShapeDimensionsCSRMatrix(void 0, [1, rowCount]);
  sizes.setDefaultValue(24);
  return { cells, filters, plugin, sizes };
}

function setDefinition(
  plugin: SheetFilterPlugin,
  filters: SheetFilterMatrix,
  definition: SheetFilterDefinition | null,
  commands?: SheetCommandBus,
): void {
  const transaction = createTransaction(SheetFilterPlugin.pluginKey, [
    createUpdateCellOTOperation([0, 0], definition, filters.getItem(0, 0)),
  ]);
  plugin.apply(plugin.getState(), transaction);
  if (!commands) {
    plugin.onTransactionCommitted(transaction);
    return;
  }
  const committed = defineSheetCommand<void>('test.filter.committed');
  commands.register(
    committed,
    () => new LocalActionCommand(committed.id, () => plugin.onTransactionCommitted(transaction)),
  );
  commands.run(committed, void 0);
}

describe('SheetFilterPlugin', () => {
  it('R2-017 shows filter arrows only in active filter header cells', () => {
    const { plugin, filters } = createFixture();
    const visuals = new SheetCellVisualReaderRegistry();
    registerSheetFilterVisuals(visuals, plugin);
    expect(visuals.readVisual({ rowIndex: 0, columnIndex: 0 }).layers).toEqual([]);

    setDefinition(plugin, filters, {
      range: { start: [1, 0], end: [4, 1] },
      firstRowIsHeader: true,
      privateView: false,
      rules: [],
    });
    for (const columnIndex of [0, 1]) {
      const visual = visuals.readVisual({ rowIndex: 1, columnIndex });
      expect(visual.properties.contentInsetEnd).toBe(22);
      expect(visual.layers).toEqual([
        expect.objectContaining({ slot: 'filter.header.arrow', icon: expect.objectContaining({ shape: 'down' }) }),
      ]);
    }
    expect(visuals.readVisual({ rowIndex: 2, columnIndex: 0 }).layers).toEqual([]);
    setDefinition(plugin, filters, null);
    expect(visuals.readVisual({ rowIndex: 1, columnIndex: 0 }).layers).toEqual([]);
  });

  it('publishes only a stable visibility view and rejects replacement lifecycle registries', () => {
    const { plugin, filters } = createFixture();
    const exposed = plugin.registerState().dataEngine.dataView[0]!.select() as {
      active: boolean;
      version: number;
      isRowFiltered(row: number): boolean;
      registerCommands?: unknown;
    };
    expect(exposed).not.toBe(plugin);
    expect(Object.isFrozen(exposed)).toBe(true);
    expect(exposed.registerCommands).toBeUndefined();

    const commands = new SheetCommandBus();
    commands.bind({
      executePipeline: (pipeline) => pipeline.steps.forEach((step) => step.localAction?.()),
      applyEffect: () => void 0,
    });
    const sessions = new SessionStateRegistry();
    plugin.registerCommands(commands);
    plugin.registerSessionState(sessions);

    expect(() => plugin.registerCommands(new SheetCommandBus())).toThrow('already bound');
    expect(() => plugin.registerSessionState(new SessionStateRegistry())).toThrow('already bound');
    expect(exposed.active).toBe(false);
    const version = exposed.version;
    setDefinition(
      plugin,
      filters,
      {
        range: { start: [0, 0], end: [5, 0] },
        firstRowIsHeader: true,
        privateView: false,
        rules: [{ column: 0, predicate: { kind: SheetFilterKind.Values, values: ['Ada'] } }],
      },
      commands,
    );
    expect(exposed.active).toBe(true);
    expect(exposed.version).toBeGreaterThan(version);
  });

  it('keeps private view and visibility cache unchanged while a document update is only staged', () => {
    const { filters, plugin } = createFixture();
    const privateView: SheetFilterDefinition = {
      range: { start: [0, 0], end: [5, 0] },
      firstRowIsHeader: true,
      privateView: true,
      rules: [{ column: 0, predicate: { kind: SheetFilterKind.Values, values: ['Ada'] } }],
    };
    const commands = new SheetCommandBus();
    plugin.registerCommands(commands);
    commands.bind({
      executePipeline: (pipeline) => pipeline.steps.forEach((step) => step.postCommit?.()),
      applyEffect: () => void 0,
    });
    commands.run(CreateSheetFilterViewCommand, {
      range: privateView.range,
      firstRowIsHeader: privateView.firstRowIsHeader,
    });
    commands.run(SetSheetColumnFilterCommand, privateView.rules[0]!);
    const version = plugin.version;
    (plugin as unknown as { privateDefinition: null }).privateDefinition = null;
    expect(plugin.active).toBe(true);
    const transaction = createTransaction(SheetFilterPlugin.pluginKey, [
      createUpdateCellOTOperation([0, 0], null, filters.getItem(0, 0)),
    ]);

    plugin.apply({ filters: filters.clone() }, transaction);

    expect(plugin.version).toBe(version);
    expect(plugin.active).toBe(true);
  });

  it('combines column rules, keeps the header, and preserves manually hidden row sizes', () => {
    const { cells, filters, plugin, sizes } = createFixture();
    cells.addItem(0, 0, 'Name');
    cells.addItem(1, 0, 'Ada');
    cells.addItem(1, 1, 20);
    cells.addItem(2, 0, 'Bob');
    cells.addItem(2, 1, 30);
    cells.addItem(3, 0, 'Ada');
    cells.addItem(3, 1, 40);
    sizes.addItem(0, 3, 0);
    setDefinition(plugin, filters, {
      range: { start: [0, 0], end: [5, 1] },
      firstRowIsHeader: true,
      privateView: false,
      rules: [
        { column: 0, predicate: { kind: SheetFilterKind.Values, values: ['Ada'] } },
        {
          column: 1,
          predicate: {
            kind: SheetFilterKind.Condition,
            category: SheetFilterCategory.Number,
            operator: SheetFilterOperator.Greater,
            value: '25',
          },
        },
      ],
    });
    const visible = new VisibleRowDimensions(sizes, plugin);
    expect([0, 1, 2, 3, 4, 5].map((row) => visible.getItem(0, row))).toEqual([24, 0, 0, 0, 0, 0]);
    expect(sizes.getItem(0, 3)).toBe(0);
    filters.removeItem(0, 0);
    const clear = createTransaction(SheetFilterPlugin.pluginKey, [createUpdateCellOTOperation([0, 0], null, null)]);
    plugin.apply(plugin.getState(), clear);
    plugin.onTransactionCommitted(clear);
    expect(visible.getItem(0, 1)).toBe(24);
    expect(visible.getItem(0, 3)).toBe(0);
  });

  it('skips cell reads for a million sparse blank rows', () => {
    const rowCount = 1_000_000;
    const { cells, filters, plugin } = createFixture(rowCount);
    cells.addItem(0, 0, 'Name');
    cells.addItem(rowCount - 1, 0, 'Match');
    setDefinition(plugin, filters, {
      range: { start: [0, 0], end: [rowCount - 1, 0] },
      firstRowIsHeader: true,
      privateView: false,
      rules: [{ column: 0, predicate: { kind: SheetFilterKind.Values, values: ['Match'] } }],
    });
    const read = jest.spyOn(cells, 'getItem');
    expect(plugin.isRowFiltered(500_000)).toBe(true);
    expect(plugin.isRowFiltered(rowCount - 1)).toBe(false);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('bounds distinct values and counts explicit and implicit blanks once', () => {
    const { cells, filters, plugin } = createFixture();
    cells.addItem(0, 0, 'Name');
    cells.addItem(1, 0, 'Ada');
    cells.addItem(2, 0, 'Bob');
    cells.addItem(3, 0, '');
    setDefinition(plugin, filters, {
      range: { start: [0, 0], end: [5, 0] },
      firstRowIsHeader: true,
      privateView: false,
      rules: [],
    });
    const queries = new SheetQueryRegistry();
    plugin.registerQueries(queries);
    expect(queries.run(ReadSheetFilterValuesQuery, { column: 0, limit: 1 })).toEqual({
      items: [{ value: 'Ada', count: 1 }],
      truncated: true,
    });
    expect(queries.run(ReadSheetFilterValuesQuery, { column: 0 })).toEqual({
      items: [
        { value: 'Ada', count: 1 },
        { value: 'Bob', count: 1 },
        { value: '', count: 3 },
      ],
      truncated: false,
    });
    expect(queries.run(ReadSheetFilterValuesQuery, { column: 0, search: 'bo' })).toEqual({
      items: [{ value: 'Bob', count: 1 }],
      truncated: false,
    });
    expect(queries.run(ReadSheetFilterValuesQuery, { column: 0, search: 'blank', includeBlank: true })).toEqual({
      items: [{ value: '', count: 3 }],
      truncated: false,
    });
  });

  it('INT15-021 groups case variants and matches the same persisted value predicate', () => {
    const { cells, filters, plugin } = createFixture(7);
    cells.addItem(0, 0, 'Key');
    cells.addItem(1, 0, 'a');
    cells.addItem(2, 0, 'A');
    cells.addItem(3, 0, 'Ä');
    cells.addItem(4, 0, 'ä');
    cells.addItem(5, 0, 1);
    cells.addItem(6, 0, '1');
    setDefinition(plugin, filters, {
      range: { start: [0, 0], end: [6, 0] },
      firstRowIsHeader: true,
      privateView: false,
      rules: [],
    });
    const queries = new SheetQueryRegistry();
    plugin.registerQueries(queries);
    expect(queries.run(ReadSheetFilterValuesQuery, { column: 0 }).items).toEqual([
      { value: 'a', count: 2 },
      { value: 'Ä', count: 2 },
      { value: '1', count: 2 },
    ]);
    expect(queries.run(ReadSheetFilterValuesQuery, { column: 0, search: 'Ä' }).items).toEqual([
      { value: 'Ä', count: 2 },
    ]);

    setDefinition(plugin, filters, {
      range: { start: [0, 0], end: [6, 0] },
      firstRowIsHeader: true,
      privateView: false,
      rules: [{ column: 0, predicate: { kind: SheetFilterKind.Values, values: ['a'] } }],
    });
    expect(plugin.isRowFiltered(1)).toBe(false);
    expect(plugin.isRowFiltered(2)).toBe(false);
    expect(plugin.isRowFiltered(3)).toBe(true);
  });

  it('BUG-863 identifies boolean filter values without relabeling text values', () => {
    const { cells, filters, plugin } = createFixture();
    cells.addItem(0, 0, 'Done');
    cells.addItem(1, 0, true);
    cells.addItem(2, 0, false);
    cells.addItem(3, 0, 'true');
    setDefinition(plugin, filters, {
      range: { start: [0, 0], end: [3, 0] },
      firstRowIsHeader: true,
      privateView: false,
      rules: [],
    });
    const queries = new SheetQueryRegistry();
    plugin.registerQueries(queries);
    expect(queries.run(ReadSheetFilterValuesQuery, { column: 0 })).toEqual({
      items: [
        { value: 'true', count: 2 },
        { value: 'false', count: 1, isBoolean: true },
      ],
      truncated: false,
    });
    cells.addItem(3, 0, true);
    expect(queries.run(ReadSheetFilterValuesQuery, { column: 0 })).toEqual({
      items: [
        { value: 'true', count: 2, isBoolean: true },
        { value: 'false', count: 1, isBoolean: true },
      ],
      truncated: false,
    });
  });

  it('does not treat blank cells as numeric zero', () => {
    const { cells, filters, plugin } = createFixture();
    cells.addItem(0, 0, 'Amount');
    cells.addItem(1, 0, 0);
    setDefinition(plugin, filters, {
      range: { start: [0, 0], end: [5, 0] },
      firstRowIsHeader: true,
      privateView: false,
      rules: [
        {
          column: 0,
          predicate: {
            kind: SheetFilterKind.Condition,
            category: SheetFilterCategory.Number,
            operator: SheetFilterOperator.Equal,
            value: '0',
          },
        },
      ],
    });
    expect(plugin.isRowFiltered(1)).toBe(false);
    expect(plugin.isRowFiltered(2)).toBe(true);
  });

  it('invalidates cached row visibility when a formula result changes', () => {
    const changes = new SheetDisplayedValueChanges(jest.fn());
    const filters = new SheetFilterMatrix();
    let result = 'Ada';
    const plugin = new SheetFilterPlugin(
      { filters },
      {
        readShape: () => [3, 1],
        readValue: () => result,
        forEachStoredInRange: (_first, _column, _last, visit) => visit(1),
        readColor: () => null,
        platform,
        displayedValueChanges: changes,
      },
    );
    setDefinition(plugin, filters, {
      range: { start: [0, 0], end: [2, 0] },
      firstRowIsHeader: true,
      privateView: false,
      rules: [{ column: 0, predicate: { kind: SheetFilterKind.Values, values: ['Ada'] } }],
    });
    expect(plugin.isRowFiltered(1)).toBe(false);
    result = 'Bob';
    changes.publish([{ row: 1, column: 0 }]);
    expect(plugin.isRowFiltered(1)).toBe(true);
    plugin.dispose();
  });

  it('moves filter columns with inserted sheet columns', () => {
    const definition: SheetFilterDefinition = {
      range: { start: [0, 0], end: [3, 1] },
      firstRowIsHeader: true,
      privateView: false,
      rules: [{ column: 1, predicate: { kind: SheetFilterKind.Values, values: ['Ada'] } }],
    };
    const projected = projectSheetFilterDefinition(definition, createInsertColOTOperation([0], [null]));
    expect(projected?.range).toEqual({ start: [0, 1], end: [3, 2] });
    expect(projected?.rules[0]?.column).toBe(2);
  });

  it('rebuilds projected row positions when rules or source sizes change', () => {
    const { cells, filters, plugin, sizes } = createFixture(3);
    cells.addItem(0, 0, 'Name');
    cells.addItem(1, 0, 'Ada');
    setDefinition(plugin, filters, {
      range: { start: [0, 0], end: [2, 0] },
      firstRowIsHeader: true,
      privateView: false,
      rules: [{ column: 0, predicate: { kind: SheetFilterKind.Values, values: ['Ada'] } }],
    });
    const visible = new VisibleRowDimensions(sizes, plugin);
    expect(visible.getDimensionsMap()).toEqual([24, 48, 48]);
    expect(() => {
      visible.getDimensionsMap()[0] = 999;
    }).toThrow();
    expect(visible.getDimensionsMap()).toEqual([24, 48, 48]);
    expect(visible.getDimensionsMap()).toEqual([24, 48, 48]);
    sizes.addItem(0, 1, 30);
    expect(visible.getDimensionsMap()).toEqual([24, 54, 54]);
    setDefinition(plugin, filters, {
      range: { start: [0, 0], end: [2, 0] },
      firstRowIsHeader: true,
      privateView: false,
      rules: [{ column: 0, predicate: { kind: SheetFilterKind.Values, values: ['Bob'] } }],
    });
    expect(visible.getDimensionsMap()).toEqual([24, 24, 24]);
  });

  it('invalidates the visibility projection after edits and color changes', () => {
    const dataTarget = new PluginKey('FilterTestData');
    const filters = new SheetFilterMatrix();
    const plugin = new SheetFilterPlugin(
      { filters },
      {
        readShape: () => [3, 2],
        readValue: () => 'Ada',
        forEachStoredInRange: (_first, _column, _last, visit) => visit(1),
        readColor: () => null,
        platform,
        dataTarget,
      },
    );
    setDefinition(plugin, filters, {
      range: { start: [0, 0], end: [2, 1] },
      firstRowIsHeader: true,
      privateView: false,
      rules: [{ column: 0, predicate: { kind: SheetFilterKind.Values, values: ['Ada'] } }],
    });
    plugin.onTransactionCommitted(createTransaction(dataTarget, [createUpdateCellOTOperation([1, 1], 'Other', null)]));
    const revisionAfterUnrelatedEdit = plugin.version;
    plugin.onTransactionCommitted(createTransaction(dataTarget, [createUpdateCellOTOperation([1, 0], 'Bob', 'Ada')]));
    expect(plugin.version).toBeGreaterThan(0);
    setDefinition(plugin, filters, {
      range: { start: [0, 0], end: [2, 1] },
      firstRowIsHeader: true,
      privateView: false,
      rules: [{ column: 0, predicate: { kind: SheetFilterKind.Color, property: 'fill', color: null } }],
    });
    plugin.onTransactionCommitted(
      createTransaction(new PluginKey('OtherVisual'), [createUpdateCellOTOperation([1, 1], '#ffffff', null)]),
    );
    expect(plugin.version).toBeGreaterThan(revisionAfterUnrelatedEdit);
  });

  it('BUG-1156 redraws other plugins when history restores filtered rows', () => {
    const filters = new SheetFilterMatrix();
    const plugin = new SheetFilterPlugin(
      { filters },
      {
        readShape: () => [3, 1],
        readValue: () => 'keep',
        forEachStoredInRange: (_first, _column, _last, visit) => visit(1),
        readColor: () => null,
        platform,
      },
    );
    const definition: SheetFilterDefinition = {
      range: { start: [0, 0], end: [2, 0] },
      firstRowIsHeader: true,
      privateView: false,
      rules: [{ column: 0, predicate: { kind: SheetFilterKind.Values, values: ['keep'] } }],
    };
    setDefinition(plugin, filters, definition);
    expect(plugin.isRowFiltered(2)).toBe(true);

    const undo = createTransaction(
      SheetFilterPlugin.pluginKey,
      [createUpdateCellOTOperation([0, 0], null, definition)],
      { [TRANSACTION_ORIGIN_META_KEY]: TransactionOrigin.History },
    );
    plugin.apply(plugin.getState(), undo);
    plugin.onTransactionCommitted(undo);

    expect(plugin.isRowFiltered(2)).toBe(false);
    expect(plugin.version).toBeGreaterThan(0);
  });
});
