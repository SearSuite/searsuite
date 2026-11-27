import { CellType } from '@searsuite/sear-domain-cell-types';
import { MatrixOTActionName } from '@searsuite/sear-domain-ot';
import { cellKey } from '@searsuite/sear-domain-formula-engine-ts';
import { SheetCommandBus } from '@searsuite/sear-assembly-commands';
import { SheetDataPlugin } from '@searsuite/sear-plugin-sheet-data';
import { ObservationRegistry } from '@searsuite/sear-foundation-subscription';
import {
  type Dependency,
  FormulaDependenciesChangedEventType,
  FormulaErrorCode,
  FormulaNodeKind,
  createFormulaError,
} from '@searsuite/sear-domain-formula-engine';
import { GetFormulaCellStatusCommand, GetFormulaDependencyStatusCommand } from '../src/FormulaStatusCommands';
import { FormulaCalculationTraceObservation } from '../src/FormulaObservations';
import { SheetFormulaPlugin } from '../src/sheetFormula/SheetFormulaPlugin';

function createPlugin(sourceCell: unknown = { type: CellType.Formula, formula: '=A1' }) {
  const dependencies: Dependency[] = [{ kind: FormulaNodeKind.Cell, row: 0, col: 0 }];
  const parser = {
    parse: jest.fn(() => ({ type: 'formula' })),
    extractDependencies: jest.fn<Dependency[], [unknown]>(() => dependencies),
  };
  const dependents = [cellKey(2, 2)];
  const graph = {
    clear: jest.fn(),
    updateCell: jest.fn(),
    removeCell: jest.fn(),
    onStructureChanged: jest.fn(),
    getDependencies: jest.fn<Dependency[], [number]>(() => dependencies),
    getDependents: jest.fn<number[], [number]>(() => dependents),
    getFormulaKeys: jest.fn<readonly number[], []>(() => []),
    isDirty: jest.fn(() => true),
  };
  const aggCache = { clear: jest.fn(), onCellChanged: jest.fn(), onStructureChanged: jest.fn() };
  const resultStore = {
    cellToFormulaValue: jest.fn(() => 1),
    clear: jest.fn(),
    delete: jest.fn(),
    get: jest.fn((_key?: unknown): unknown => 42),
    set: jest.fn(),
  };
  const scheduler = {
    bindAstCache: jest.fn<void, [Map<number, unknown>]>(),
    invalidateFunctionCallIndexes: jest.fn(),
    markDirty: jest.fn(),
    discardPendingWork: jest.fn(),
  };
  const refShifter = { shiftAll: jest.fn(() => []) };
  const trace = { emit: jest.fn(), subscribeFormulaCalculationTrace: jest.fn(() => jest.fn()) };
  const sheetData = { getItem: jest.fn(() => sourceCell) };
  const dataEngine = { readDataViewField: jest.fn(() => sheetData) };
  const platform = { warn: jest.fn() };
  const plugin = new SheetFormulaPlugin(
    parser as never,
    graph as never,
    aggCache as never,
    resultStore as never,
    scheduler as never,
    refShifter as never,
    trace as never,
    dataEngine as never,
    platform as never,
  );
  return {
    plugin,
    astCache: scheduler.bindAstCache.mock.calls[0][0] as Map<number, unknown>,
    parser,
    graph,
    aggCache,
    resultStore,
    scheduler,
    refShifter,
    trace,
    sheetData,
    dataEngine,
    platform,
    dependencies,
    dependents,
  };
}

describe('SheetFormulaPlugin', () => {
  it('keeps derived ASTs out of plugin state and leaves them unchanged during staging', () => {
    const { astCache, plugin, parser } = createPlugin();
    const key = cellKey(0, 1);
    const previous = { type: 'previous' };
    const next = { type: 'next' };
    astCache.set(key, previous);
    parser.parse.mockReturnValue(next);
    const transaction = {
      pluginKey: SheetDataPlugin.pluginKey,
      operations: [
        {
          p: [0, 1],
          [MatrixOTActionName.UpdateCell]: {
            value: { type: CellType.Formula, formula: '=B1' },
            prev: { type: CellType.Formula, formula: '=A1' },
          },
        },
      ],
    } as never;

    expect(plugin.getState()).toBeNull();
    expect(plugin.registerState().dataEngine.enabled).toBe(false);
    expect(plugin.apply(plugin.getState(), transaction)).toBeNull();
    expect(astCache.get(key)).toBe(previous);
    plugin.onTransactionCommitted(transaction);
    expect(astCache.get(key)).toBe(next);
  });

  it('ignores cell-format updates that share the update-cell operation name', () => {
    const { astCache, plugin, graph, resultStore } = createPlugin();
    const state = plugin.getState();
    const key = cellKey(0, 1);
    astCache.set(key, { kind: FormulaNodeKind.Cell, row: 0, col: 0, absRow: false, absCol: false });
    const transaction = {
      pluginKey: { key: 'cell-format' },
      operations: [{ p: [0, 1], [MatrixOTActionName.UpdateCell]: { value: null, prev: null } }],
    } as never;

    expect(plugin.apply(state, transaction)).toBeNull();
    plugin.onTransactionCommitted(transaction);
    expect(astCache.has(key)).toBe(true);
    expect(graph.clear).not.toHaveBeenCalled();
    expect(resultStore.clear).not.toHaveBeenCalled();
  });

  it('indexes initial formulas, schedules them after scanning, and exposes registered state', () => {
    const { plugin, graph, scheduler, trace, dependencies } = createPlugin();
    graph.getDependencies.mockReturnValueOnce([]).mockReturnValue(dependencies);

    plugin.onInitialDataCell({ type: CellType.Formula, formula: '=A1' }, 2, 3);
    plugin.onInitialDataCell({ type: CellType.Number, value: 1 }, 2, 4);
    plugin.onInitialDataComplete();

    expect(graph.updateCell).toHaveBeenCalledWith(131075, dependencies);
    expect(scheduler.markDirty).toHaveBeenCalledWith([131075]);
    expect(plugin.registerState().state).toBe(plugin.getState());

    expect(trace.emit).toHaveBeenCalledWith({
      type: FormulaDependenciesChangedEventType,
      key: 131075,
      row: 2,
      col: 3,
      previousDependencies: [],
      dependencies,
    });
  });

  it('leaves invalid initial formulas out of the dependency graph', () => {
    const { plugin, parser, graph, scheduler, platform } = createPlugin();
    parser.parse.mockImplementation(() => {
      throw new Error('invalid formula');
    });

    plugin.onInitialDataCell({ type: CellType.Formula, formula: '=?' }, 0, 0);
    plugin.onInitialDataComplete();

    expect(platform.warn).toHaveBeenCalledWith(
      expect.stringContaining('[Formula] Failed to parse initial formula at (0,0):'),
      expect.any(Error),
    );
    expect(graph.updateCell).not.toHaveBeenCalled();
    expect(scheduler.markDirty).not.toHaveBeenCalled();
  });

  it('removes derived formula state when a formula update cannot be parsed', () => {
    const { astCache, plugin, parser, graph, aggCache, resultStore, scheduler } = createPlugin();
    const state = plugin.getState();
    astCache.set(1, { type: 'old' } as never);
    parser.parse.mockImplementation(() => {
      throw new Error('invalid formula');
    });
    const transaction = {
      pluginKey: SheetDataPlugin.pluginKey,
      operations: [
        {
          p: [0, 1],
          [MatrixOTActionName.UpdateCell]: {
            value: { type: CellType.Formula, formula: '=?' },
            prev: { type: CellType.Number, value: 1 },
          },
        },
      ],
    };

    expect(plugin.apply(state, transaction as never)).toBe(state);
    plugin.onTransactionCommitted(transaction as never);
    expect(aggCache.clear).toHaveBeenCalledTimes(1);
    expect(astCache.has(1)).toBe(false);
    expect(graph.clear).toHaveBeenCalledTimes(1);
    expect(resultStore.clear).toHaveBeenCalledTimes(1);
    expect(scheduler.markDirty).toHaveBeenCalledWith([]);
  });

  it('updates formula dependencies and retains the parsed AST for a valid formula edit', () => {
    const { astCache, plugin, parser, graph, resultStore, scheduler } = createPlugin();
    const state = plugin.getState();
    const parsedAst = { type: 'new-formula' };
    parser.parse.mockReturnValue(parsedAst);
    const transaction = {
      pluginKey: SheetDataPlugin.pluginKey,
      operations: [
        {
          p: [1, 2],
          [MatrixOTActionName.UpdateCell]: {
            value: { type: CellType.Formula, formula: '=A1+1' },
            prev: { type: CellType.Number, value: 1 },
          },
        },
      ],
    };

    plugin.apply(state, transaction as never);
    plugin.onTransactionCommitted(transaction as never);

    expect(astCache.get(65538)).toBe(parsedAst);
    expect(graph.updateCell).toHaveBeenCalledWith(65538, expect.any(Array));
    expect(resultStore.clear).toHaveBeenCalledTimes(1);
    expect(scheduler.markDirty).toHaveBeenCalledWith([65538]);
  });

  it('emits dependency-change trace after committed formula dependency rebuilds', () => {
    const { astCache, plugin, graph, parser, trace } = createPlugin();
    const target = cellKey(0, 1);
    const previousDependencies = [{ kind: FormulaNodeKind.Cell, row: 0, col: 0 }];
    const dependencies = [{ kind: FormulaNodeKind.Cell, row: 0, col: 2 }];
    astCache.set(target, { type: 'formula' } as never);
    graph.getFormulaKeys.mockReturnValue([target]);
    graph.getDependencies.mockReturnValueOnce(previousDependencies).mockReturnValueOnce(dependencies);
    parser.extractDependencies.mockReturnValue(dependencies);

    plugin.onTransactionCommitted({
      pluginKey: SheetDataPlugin.pluginKey,
      operations: [
        {
          p: [0, 1],
          [MatrixOTActionName.UpdateCell]: {
            value: { type: CellType.Formula, formula: '=C1' },
            prev: { type: CellType.Formula, formula: '=A1' },
          },
        },
      ],
    } as never);

    expect(trace.emit).toHaveBeenCalledWith({
      type: FormulaDependenciesChangedEventType,
      key: target,
      row: 0,
      col: 1,
      previousDependencies,
      dependencies,
    });
  });

  it('removes cached formula state when a formula cell is overwritten by a non-formula value', () => {
    const { astCache, plugin, graph, resultStore, scheduler } = createPlugin();
    const state = plugin.getState();
    astCache.set(42, { type: 'formula' } as never);

    const transaction = {
      pluginKey: SheetDataPlugin.pluginKey,
      operations: [
        {
          p: [0, 42],
          [MatrixOTActionName.UpdateCell]: {
            value: { type: CellType.Number, value: 100 },
            prev: { type: CellType.Formula, formula: '=A1' },
          },
        },
      ],
    } as never;
    plugin.apply(state, transaction);
    plugin.onTransactionCommitted(transaction);

    expect(astCache.has(42)).toBe(false);
    expect(graph.clear).toHaveBeenCalledTimes(1);
    expect(resultStore.clear).toHaveBeenCalledTimes(1);
    expect(scheduler.markDirty).toHaveBeenCalledWith([]);
  });

  it('shifts formula dependencies and invalidates aggregate results after a structural edit', () => {
    const { astCache, plugin, parser, graph, aggCache, scheduler, refShifter } = createPlugin();
    const state = plugin.getState();
    astCache.set(1, { type: 'original' } as never);
    const shiftedAst = { type: 'shifted' };
    refShifter.shiftAll.mockReturnValue([{ key: 65537, newAst: shiftedAst }] as never);
    const transaction = {
      pluginKey: SheetDataPlugin.pluginKey,
      operations: [{ p: [1], [MatrixOTActionName.RowInsert]: [null, null] }],
    };

    plugin.apply(state, transaction as never);
    plugin.onTransactionCommitted(transaction as never);

    expect(refShifter.shiftAll).toHaveBeenCalledWith(astCache, [
      { type: MatrixOTActionName.RowInsert, index: 1, count: 1 },
    ]);
    expect(astCache.get(65537)).toBe(shiftedAst);
    expect(parser.extractDependencies).toHaveBeenCalledWith(shiftedAst);
    expect(graph.updateCell).toHaveBeenCalledWith(65537, expect.any(Array));
    expect(graph.clear).toHaveBeenCalledTimes(1);
    expect(aggCache.clear).toHaveBeenCalledTimes(1);
    expect(scheduler.markDirty).toHaveBeenCalledWith([1, 65537]);
  });

  it('rebases formula cache keys when structural edits move formula cells', () => {
    const { astCache, plugin, graph, scheduler } = createPlugin();
    const state = plugin.getState();
    const oldKey = cellKey(2, 1);
    const newKey = cellKey(3, 1);
    const ast = { type: 'formula' };
    astCache.set(oldKey, ast as never);

    const transaction = {
      pluginKey: SheetDataPlugin.pluginKey,
      operations: [{ p: [1], [MatrixOTActionName.RowInsert]: [null, null] }],
    };

    plugin.apply(state, transaction as never);
    plugin.onTransactionCommitted(transaction as never);

    expect(astCache.has(oldKey)).toBe(false);
    expect(astCache.get(newKey)).toBe(ast);
    expect(graph.updateCell).toHaveBeenCalledWith(newKey, expect.any(Array));
    expect(scheduler.markDirty).toHaveBeenCalledWith([newKey]);
  });

  it('indexes formulas carried by inserted structural payloads', () => {
    const { astCache, plugin, parser, graph, scheduler } = createPlugin();
    const state = plugin.getState();
    const ast = { type: 'restored-formula' };
    parser.parse.mockReturnValue(ast);
    const formulaKey = cellKey(2, 1);

    const transaction = {
      pluginKey: SheetDataPlugin.pluginKey,
      operations: [
        {
          p: [2],
          [MatrixOTActionName.RowInsert]: [null, { type: CellType.Formula, formula: '=A1' }],
        },
      ],
    };

    plugin.apply(state, transaction as never);
    plugin.onTransactionCommitted(transaction as never);

    expect(astCache.get(formulaKey)).toBe(ast);
    expect(graph.updateCell).toHaveBeenCalledWith(formulaKey, expect.any(Array));
    expect(scheduler.markDirty).toHaveBeenCalledWith([formulaKey]);
  });

  it('clears inserted formula payloads that fail parsing', () => {
    const { astCache, plugin, parser, graph, scheduler } = createPlugin();
    const state = plugin.getState();
    const formulaKey = cellKey(2, 1);
    parser.parse.mockImplementation(() => {
      throw new Error('invalid formula');
    });

    const transaction = {
      pluginKey: SheetDataPlugin.pluginKey,
      operations: [
        {
          p: [2],
          [MatrixOTActionName.RowInsert]: [null, { type: CellType.Formula, formula: '=?' }],
        },
      ],
    };

    plugin.apply(state, transaction as never);
    plugin.onTransactionCommitted(transaction as never);

    expect(astCache.has(formulaKey)).toBe(false);
    expect(graph.updateCell).not.toHaveBeenCalled();
    expect(scheduler.markDirty).toHaveBeenCalledWith([]);
  });

  it('removes formula cache entries when structural edits delete formula cells', () => {
    const { astCache, plugin, graph, scheduler } = createPlugin();
    const state = plugin.getState();
    astCache.set(cellKey(2, 1), { type: 'formula' } as never);

    const transaction = {
      pluginKey: SheetDataPlugin.pluginKey,
      operations: [{ p: [2], [MatrixOTActionName.RowDelete]: [null] }],
    };

    plugin.apply(state, transaction as never);
    plugin.onTransactionCommitted(transaction as never);

    expect(astCache.size).toBe(0);
    expect(graph.updateCell).not.toHaveBeenCalled();
    expect(scheduler.markDirty).toHaveBeenCalledWith([]);
  });

  it('rebases formula cache keys around deleted columns', () => {
    const { astCache, plugin } = createPlugin();
    const state = plugin.getState();
    const beforeKey = cellKey(2, 0);
    const deletedKey = cellKey(2, 1);
    const shiftedKey = cellKey(2, 3);
    const nextShiftedKey = cellKey(2, 2);
    const beforeAst = { type: 'before' };
    const deletedAst = { type: 'deleted' };
    const shiftedAst = { type: 'shifted' };
    astCache.set(beforeKey, beforeAst as never);
    astCache.set(deletedKey, deletedAst as never);
    astCache.set(shiftedKey, shiftedAst as never);

    const transaction = {
      pluginKey: SheetDataPlugin.pluginKey,
      operations: [{ p: [1], [MatrixOTActionName.ColDelete]: [null] }],
    } as never;
    plugin.apply(state, transaction);
    plugin.onTransactionCommitted(transaction);

    expect(astCache.get(beforeKey)).toBe(beforeAst);
    expect(astCache.has(deletedKey)).toBe(false);
    expect(astCache.get(nextShiftedKey)).toBe(shiftedAst);
  });

  it('keeps formulas before deleted rows and swaps cache-key coordinates for moves', () => {
    const { astCache, plugin } = createPlugin();
    const state = plugin.getState();
    const key = cellKey(1, 1);
    const ast = { type: 'formula' };
    astCache.set(key, ast as never);

    const transaction = {
      pluginKey: SheetDataPlugin.pluginKey,
      operations: [{ p: [3], [MatrixOTActionName.RowDelete]: [null] }],
    } as never;
    plugin.apply(state, transaction);
    plugin.onTransactionCommitted(transaction);

    expect(astCache.get(key)).toBe(ast);
    const move = { pluginKey: SheetDataPlugin.pluginKey, operations: [{ p: [1], [MatrixOTActionName.RowMove]: [3] }] };
    plugin.apply(state, move as never);
    plugin.onTransactionCommitted(move as never);
    expect(astCache.get(cellKey(3, 1))).toBe(ast);
    expect(astCache.has(key)).toBe(false);
  });

  it('rebases formula cache keys below deleted rows and before inserted columns', () => {
    const { astCache, plugin } = createPlugin();
    const state = plugin.getState();
    const shiftedRowKey = cellKey(4, 1);
    const nextShiftedRowKey = cellKey(3, 1);
    const beforeColumnKey = cellKey(1, 1);
    const shiftedRowAst = { type: 'shifted-row' };
    const beforeColumnAst = { type: 'before-column' };
    astCache.set(shiftedRowKey, shiftedRowAst as never);
    astCache.set(beforeColumnKey, beforeColumnAst as never);

    const transaction = {
      pluginKey: SheetDataPlugin.pluginKey,
      operations: [
        { p: [2], [MatrixOTActionName.RowDelete]: [null] },
        { p: [3], [MatrixOTActionName.ColInsert]: [null, null] },
      ],
    } as never;
    plugin.apply(state, transaction);
    plugin.onTransactionCommitted(transaction);

    expect(astCache.get(nextShiftedRowKey)).toBe(shiftedRowAst);
    expect(astCache.get(beforeColumnKey)).toBe(beforeColumnAst);
  });

  it('ignores non-formula updates without stale formula cache and unrelated commits', () => {
    const { astCache, plugin, graph, resultStore, scheduler } = createPlugin();
    const state = plugin.getState();

    plugin.apply(state, {
      pluginKey: SheetDataPlugin.pluginKey,
      operations: [
        {
          p: [0, 0],
          [MatrixOTActionName.UpdateCell]: {
            value: { type: CellType.Number, value: 1 },
            prev: null,
          },
        },
      ],
    } as never);
    plugin.onTransactionCommitted({ pluginKey: SheetDataPlugin.pluginKey, operations: [{ p: [0] }] } as never);

    expect(astCache.size).toBe(0);
    expect(graph.clear).not.toHaveBeenCalled();
    expect(resultStore.clear).not.toHaveBeenCalled();
    expect(scheduler.markDirty).not.toHaveBeenCalled();
  });

  it('returns the cached result for a formula cell', () => {
    const { plugin, resultStore } = createPlugin();

    expect(plugin.getFormulaResult(3, 4)).toBe(42);
    expect(resultStore.get).toHaveBeenCalledWith(196612);
  });

  it('returns source, result, error, dirty state, and dependency status for a formula cell', () => {
    const { plugin, graph, resultStore, dependencies, dependents } = createPlugin({
      type: CellType.Formula,
      formula: '=A1/B1',
    });
    const error = createFormulaError(FormulaErrorCode.DivisionByZero);
    resultStore.get.mockReturnValue(error);

    expect(plugin.getFormulaCellStatus(1, 1)).toEqual({
      row: 1,
      col: 1,
      isFormulaCell: true,
      formula: '=A1/B1',
      result: error,
      errorCode: FormulaErrorCode.DivisionByZero,
      dirty: true,
      dependencies,
      dependents,
    });
    expect(graph.getDependencies).toHaveBeenCalledWith(cellKey(1, 1));
    expect(graph.getDependents).toHaveBeenCalledWith(cellKey(1, 1));
    expect(graph.isDirty).toHaveBeenCalledWith(cellKey(1, 1));
  });

  it('returns dependents without formula-only fields for a non-formula cell', () => {
    const { plugin, graph, resultStore, dependents } = createPlugin({ type: CellType.Number, value: 5 });

    expect(plugin.getFormulaCellStatus(0, 0)).toEqual({
      row: 0,
      col: 0,
      isFormulaCell: false,
      formula: void 0,
      result: void 0,
      errorCode: void 0,
      dirty: false,
      dependencies: [],
      dependents,
    });
    expect(resultStore.get).not.toHaveBeenCalled();
    expect(graph.getDependencies).not.toHaveBeenCalled();
    expect(graph.isDirty).not.toHaveBeenCalled();
    expect(graph.getDependents).toHaveBeenCalledWith(cellKey(0, 0));
  });

  it('handles missing source data and formula cells without formula text in status snapshots', () => {
    const withoutFormulaText = createPlugin({ type: CellType.Formula });

    expect(withoutFormulaText.plugin.getFormulaCellStatus(0, 0).formula).toBeUndefined();

    const parser = {
      parse: jest.fn(() => ({ type: 'formula' })),
      extractDependencies: jest.fn(() => []),
    };
    const graph = {
      clear: jest.fn(),
      updateCell: jest.fn(),
      removeCell: jest.fn(),
      onStructureChanged: jest.fn(),
      getDependencies: jest.fn(() => []),
      getDependents: jest.fn(() => []),
      getFormulaKeys: jest.fn(() => []),
      isDirty: jest.fn(() => false),
    };
    const resultStore = {
      cellToFormulaValue: jest.fn(() => 0),
      clear: jest.fn(),
      delete: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
    };
    const plugin = new SheetFormulaPlugin(
      parser as never,
      graph as never,
      { clear: jest.fn(), onCellChanged: jest.fn(), onStructureChanged: jest.fn() } as never,
      resultStore as never,
      { bindAstCache: jest.fn(), markDirty: jest.fn(), discardPendingWork: jest.fn() } as never,
      { shiftAll: jest.fn(() => []) } as never,
      { emit: jest.fn(), subscribeFormulaCalculationTrace: jest.fn(() => jest.fn()) } as never,
    );

    expect(plugin.getFormulaCellStatus(4, 5)).toEqual({
      row: 4,
      col: 5,
      isFormulaCell: false,
      formula: void 0,
      result: void 0,
      errorCode: void 0,
      dirty: false,
      dependencies: [],
      dependents: [],
    });
  });

  it('registers status commands and the calculation trace observation', () => {
    const { plugin, trace } = createPlugin({ type: CellType.Formula, formula: '=A1' });
    const commands = new SheetCommandBus();
    const executePipeline = jest.fn();
    const observations = new ObservationRegistry();
    commands.bind({ executePipeline, applyEffect: jest.fn() });
    plugin.registerCommands(commands);
    plugin.registerObservations(observations);

    const result = commands.run(GetFormulaCellStatusCommand, { row: 0, col: 1 });
    const dependencyResult = commands.run(GetFormulaDependencyStatusCommand, { row: 0, col: 1 });
    const listener = jest.fn();
    const unsubscribe = jest.fn();
    trace.subscribeFormulaCalculationTrace.mockReturnValueOnce(unsubscribe);
    const dispose = observations.subscribe(FormulaCalculationTraceObservation, listener);

    expect(result.status.formula).toBe('=A1');
    expect(result.status.dependencies).toEqual([{ kind: FormulaNodeKind.Cell, row: 0, col: 0 }]);
    expect(dependencyResult.dependencyStatus).toMatchObject({
      cell: { row: 0, col: 1, ref: 'B1' },
      precedents: [{ kind: FormulaNodeKind.Cell, row: 0, col: 0, ref: 'A1' }],
      dependents: [{ row: 2, col: 2, ref: 'C3' }],
      transitivePrecedents: [],
      transitiveDependents: [],
    });
    expect(trace.subscribeFormulaCalculationTrace).toHaveBeenCalledWith(expect.any(Function));
    expect(executePipeline).toHaveBeenCalledTimes(2);
    expect(result.pipeline.steps).toEqual([]);
    expect(dependencyResult.pipeline.steps).toEqual([]);
    dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('returns bounded transitive dependency status when requested', () => {
    const { plugin, graph } = createPlugin({ type: CellType.Formula, formula: '=A1' });
    const commands = new SheetCommandBus();
    commands.bind({ executePipeline: jest.fn(), applyEffect: jest.fn() });
    plugin.registerCommands(commands);
    graph.getDependencies.mockImplementation((key: number) => {
      if (key === cellKey(0, 1)) return [{ kind: FormulaNodeKind.Cell, row: 0, col: 0 }];
      if (key === cellKey(0, 0)) return [{ kind: FormulaNodeKind.Cell, row: 0, col: 2 }];
      return [];
    });
    graph.getDependents.mockImplementation((key: number) => {
      if (key === cellKey(0, 1)) return [cellKey(2, 2)];
      if (key === cellKey(2, 2)) return [cellKey(3, 3)];
      return [];
    });

    const result = commands.run(GetFormulaDependencyStatusCommand, {
      row: 0,
      col: 1,
      includeTransitive: true,
      maxDepth: 2,
    });

    expect(result.dependencyStatus.transitivePrecedents).toEqual([
      { row: 0, col: 0, ref: 'A1' },
      { row: 0, col: 2, ref: 'C1' },
    ]);
    expect(result.dependencyStatus.transitiveDependents).toEqual([
      { row: 2, col: 2, ref: 'C3' },
      { row: 3, col: 3, ref: 'D4' },
    ]);
  });

  it('ignores empty initial-dirty queue and applies row and column move operations', () => {
    const { astCache, plugin, scheduler, refShifter } = createPlugin();
    plugin.onInitialDataComplete();
    expect(scheduler.markDirty).not.toHaveBeenCalled();

    const transaction = {
      pluginKey: SheetDataPlugin.pluginKey,
      operations: [
        { p: [0], [MatrixOTActionName.RowMove]: [2] },
        { p: [0], [MatrixOTActionName.ColMove]: [3] },
      ],
    } as never;
    plugin.apply(plugin.getState(), transaction);
    plugin.onTransactionCommitted(transaction);

    expect(refShifter.shiftAll).toHaveBeenNthCalledWith(1, astCache, [
      { type: MatrixOTActionName.RowMove, fromIndex: 0, toIndex: 2 },
    ]);
    expect(refShifter.shiftAll).toHaveBeenNthCalledWith(2, astCache, [
      { type: MatrixOTActionName.ColMove, fromIndex: 0, toIndex: 3 },
    ]);
  });

  it('handles row-delete, col-insert, and col-delete structural changes', () => {
    const { astCache, plugin, refShifter, graph, aggCache, scheduler } = createPlugin();
    const state = plugin.getState();
    astCache.set(10, { type: 'old' } as never);
    refShifter.shiftAll.mockReturnValue([{ key: 11, newAst: { type: 'new' } }] as never);

    const transaction = {
      pluginKey: SheetDataPlugin.pluginKey,
      operations: [
        { p: [2], [MatrixOTActionName.RowDelete]: [null, null, null] },
        { p: [3], [MatrixOTActionName.ColInsert]: [null, null] },
        { p: [1], [MatrixOTActionName.ColDelete]: [null, null] },
      ],
    } as never;
    plugin.apply(state, transaction);
    plugin.onTransactionCommitted(transaction);

    expect(refShifter.shiftAll).toHaveBeenCalledTimes(3);
    expect(graph.clear).toHaveBeenCalledTimes(1);
    expect(aggCache.clear).toHaveBeenCalledTimes(1);
    expect(scheduler.markDirty).toHaveBeenCalled();
  });

  it('ignores unrelated operations that do not match formula-relevant OT types', () => {
    const { plugin } = createPlugin();
    const state = plugin.getState();

    expect(() =>
      plugin.apply(state, {
        pluginKey: SheetDataPlugin.pluginKey,
        operations: [{ p: [0] }],
      } as never),
    ).not.toThrow();
  });
});
