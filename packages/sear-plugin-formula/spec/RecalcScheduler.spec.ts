import { RecalcScheduler } from '../src/RecalcScheduler';
import {
  type CellKey,
  type EvalContext,
  type EvalResult,
  type FormulaText,
  FormulaBatchFlushedEventType,
  FormulaErrorChangedEventType,
  FormulaErrorCode,
  FormulaRecalculationCompletedEventType,
  createFormulaError,
} from '@searsuite/sear-domain-formula-engine';
import { cellKey } from '@searsuite/sear-domain-formula-engine-ts';
import { isFormulaError } from '@searsuite/sear-foundation-utils';
import { FormulaValuePublisher } from '../src/FormulaValuePublisher';
import { SheetDisplayedValueChanges } from '@searsuite/sear-domain-cell-types';

describe('RecalcScheduler', () => {
  let graph: any;
  let evaluator: any;
  let resultStore: any;
  let aggCache: any;
  let dataSource: any;
  let platform: any;
  let renderInvalidator: any;
  let trace: { emit: jest.Mock };
  let scheduler: any;
  let astCache: Map<CellKey, any>;
  let viewportChangedHandler: () => void;
  let externalServiceInvalidatedHandler: (functionNames: readonly string[]) => void;

  beforeEach(() => {
    graph = {
      markDirty: jest.fn(),
      getLastCycleKeys: jest.fn().mockReturnValue([]),
      pendingCount: 0,
      getNextReadyBatch: jest.fn().mockReturnValue([]),
      markClean: jest.fn(),
    };
    evaluator = {
      evaluateBatch: jest.fn().mockReturnValue([]),
    };
    resultStore = {
      get: jest.fn(),
      set: jest.fn(),
      setRichResult: jest.fn(),
      cellToFormulaValue: jest.fn((r, c) => `${r},${c}`),
    };
    aggCache = {
      onCellChanged: jest.fn(),
      clear: jest.fn(),
    };
    const context: EvalContext = {
      isCellInBounds: (row: number, col: number): boolean => row >= 0 && row < 10 && col >= 0 && col < 10,
      getSheetShape: (): [number, number] => [10, 10],
      getCellValue: (row: number, col: number) =>
        row >= 0 && row < 10 && col >= 0 && col < 10
          ? resultStore.cellToFormulaValue(row, col, null)
          : createFormulaError(FormulaErrorCode.Reference),
      iterateRange: (startRow: number, startCol: number, endRow: number, endCol: number) => {
        if (startRow < 0 || startCol < 0 || endRow >= 10 || endCol >= 10) {
          return [createFormulaError(FormulaErrorCode.Reference)];
        }
        return {
          *[Symbol.iterator]() {
            for (let r = startRow; r <= endRow; r++) {
              for (let c = startCol; c <= endCol; c++) {
                yield resultStore.cellToFormulaValue(r, c, null);
              }
            }
          },
        };
      },
    };
    viewportChangedHandler = () => {};
    externalServiceInvalidatedHandler = () => {};
    dataSource = {
      createEvalContext: jest.fn().mockReturnValue(context),
      getViewportFormulaKeys: jest.fn((keys: Iterable<CellKey>) => new Set(keys)),
      onViewportChanged: jest.fn((handler: () => void) => {
        viewportChangedHandler = handler;
        return jest.fn();
      }),
      onExternalServiceInvalidated: jest.fn((handler: (functionNames: readonly string[]) => void) => {
        externalServiceInvalidatedHandler = handler;
        return jest.fn();
      }),
    };
    platform = {
      now: jest.fn().mockReturnValue(0),
      queueMicrotask: jest.fn((cb) => cb()),
      requestAnimationFrame: jest.fn(),
      warn: jest.fn(),
    };
    renderInvalidator = {
      publishResults: jest.fn(),
    };
    trace = {
      emit: jest.fn(),
    };

    scheduler = new RecalcScheduler(
      graph,
      evaluator,
      resultStore,
      aggCache,
      dataSource,
      platform,
      renderInvalidator,
      trace as never,
    );
    astCache = new Map();
    scheduler.bindAstCache(astCache);
  });

  it('runs basic batch', () => {
    graph.pendingCount = 1;
    graph.getNextReadyBatch = jest
      .fn()
      .mockReturnValueOnce([cellKey(0, 0)])
      .mockReturnValueOnce([]);
    astCache.set(cellKey(0, 0), { kind: 'number', value: 1 });
    evaluator.evaluateBatch = jest.fn().mockReturnValue([{ key: cellKey(0, 0), value: 100 }]);

    scheduler.markDirty([cellKey(0, 0)]);
    expect(evaluator.evaluateBatch).toHaveBeenCalled();
  });

  it('recalculates viewport-dependent formulas only when the first visible cell changes', () => {
    let origin = { row: 0, col: 0 };
    dataSource.getVisibleOrigin = () => origin;
    const registry = {
      list: jest.fn(() => ['INFO']),
      get: jest.fn(() => ({ volatileOnViewport: true })),
      subscribe: () => () => {},
    };
    const viewportScheduler = new RecalcScheduler(
      graph,
      evaluator,
      resultStore,
      aggCache,
      dataSource,
      platform,
      renderInvalidator,
      trace as never,
      registry as never,
    );
    const key = cellKey(2, 3);
    const viewportCache = new Map([
      [
        key,
        {
          kind: 'call',
          name: 'INFO',
          args: [{ kind: 'string', value: 'origin' }],
        } as never,
      ],
    ]);
    viewportScheduler.bindAstCache(viewportCache);

    viewportChangedHandler();
    expect(graph.markDirty).toHaveBeenLastCalledWith([key]);
    const count = graph.markDirty.mock.calls.length;
    viewportChangedHandler();
    expect(graph.markDirty).toHaveBeenCalledTimes(count);
    origin = { row: 1, col: 0 };
    viewportChangedHandler();
    expect(graph.markDirty).toHaveBeenCalledTimes(count + 1);
    expect(registry.list).toHaveBeenCalledTimes(1);
    expect(registry.get).toHaveBeenCalledTimes(2);
    const nextKey = cellKey(3, 3);
    viewportCache.set(nextKey, { kind: 'call', name: 'INFO', args: [{ kind: 'string', value: 'origin' }] } as never);
    viewportScheduler.invalidateFunctionCallIndexes();
    origin = { row: 2, col: 0 };
    viewportChangedHandler();
    expect(graph.markDirty).toHaveBeenLastCalledWith([key, nextKey]);
    expect(registry.list).toHaveBeenCalledTimes(2);
    viewportScheduler.dispose();
  });

  it('does not expose or replace the formula AST cache after binding', () => {
    astCache.set(cellKey(1, 2), { kind: 'number', value: 3 });
    expect([...scheduler.getFormulaKeys()]).toEqual([cellKey(1, 2)]);
    expect(scheduler.astCache).toBeUndefined();
    expect(() => scheduler.bindAstCache(new Map())).toThrow();
  });

  it('allows teardown only through the owning editor lifecycle after binding', () => {
    const teardownToken = {};
    const disposeViewport = dataSource.onViewportChanged.mock.results[0].value;
    scheduler.bindCommandBus({ isExecuting: () => false } as never);
    scheduler.bindTeardownToken(teardownToken);
    Object.assign(scheduler, { teardownToken });

    expect(() => scheduler.dispose()).toThrow('editor.commands.run');
    expect(disposeViewport).not.toHaveBeenCalled();
    expect(() => scheduler.bindTeardownToken({})).toThrow('already bound');
    scheduler.dispose(teardownToken);
    expect(disposeViewport).toHaveBeenCalledTimes(1);
    expect(() => scheduler.dispose()).not.toThrow();
  });

  it('allows a new batch after pending work is discarded', async () => {
    graph.pendingCount = 1;
    platform.queueMicrotask = jest.fn();
    scheduler.markDirty([]);
    const idle = scheduler.waitForIdle();
    graph.pendingCount = 0;
    scheduler.discardPendingWork();
    await idle;
    graph.pendingCount = 1;
    scheduler.markDirty([]);
    expect(platform.queueMicrotask).toHaveBeenCalledTimes(2);
  });

  it('keeps scheduler state private from a retained instance', () => {
    platform.queueMicrotask = jest.fn();
    graph.pendingCount = 1;
    Object.assign(scheduler, { currentGeneration: 900, isRunning: true, budgetMs: 0 });
    scheduler.markDirty([cellKey(0, 0)]);
    expect(platform.queueMicrotask).toHaveBeenCalledTimes(1);
    graph.pendingCount = 0;
    platform.queueMicrotask.mock.calls[0][0]();
    expect(trace.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: FormulaRecalculationCompletedEventType,
        generation: 1,
      }),
    );
  });

  it('handles cycle keys (lines 99-100)', () => {
    graph.getLastCycleKeys = jest.fn().mockReturnValue([cellKey(1, 1)]);
    scheduler.markDirty([cellKey(1, 1)]);
    expect(resultStore.set).toHaveBeenCalledWith(cellKey(1, 1), expect.objectContaining({ code: '#REF!' }));
    expect(graph.markClean).toHaveBeenCalledWith(cellKey(1, 1));
  });

  it('handles generation mismatch (lines 145-147)', () => {
    graph.pendingCount = 1;
    let runCount = 0;
    // mock runBatch to simulate a new generation starting while in loop
    graph.getNextReadyBatch = jest.fn().mockImplementation(() => {
      if (runCount === 0) {
        runCount++;
        scheduler.markDirty([]);
        return [cellKey(0, 0)];
      }
      graph.pendingCount = 1; // Leave it > 0 so it schedules again
      return [];
    });

    scheduler.resumePendingWork(); // starts runBatch
    expect(platform.queueMicrotask).toHaveBeenCalled();

    // Now test generation mismatch with pendingCount = 0 inside the condition
    runCount = 0;
    let pendingCountCalls = 0;
    Object.defineProperty(graph, 'pendingCount', {
      get: () => {
        pendingCountCalls++;
        console.log('pendingCount getter called', pendingCountCalls);
        // 1st call: while loop condition -> returns 1 so it enters
        // 2nd call: if (this.graph.pendingCount > 0) -> returns 0 so it skips schedule
        return pendingCountCalls <= 2 ? 1 : 0;
      },
      configurable: true,
    });

    graph.getNextReadyBatch = jest.fn().mockImplementation(() => {
      scheduler.markDirty([]);
      return [cellKey(0, 0)];
    });

    platform.queueMicrotask.mockClear();
    scheduler.resumePendingWork();
    expect(platform.queueMicrotask).toHaveBeenCalledTimes(1); // Not recursively scheduled
  });

  it('handles budget exceed (lines 152-153)', () => {
    graph.pendingCount = 1;
    platform.now = jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(100); // Exceed budget
    scheduler.resumePendingWork();
    expect(platform.requestAnimationFrame).toHaveBeenCalled();
  });

  it('executes scheduled animation-frame callback after yielding by budget', () => {
    graph.pendingCount = 1;
    graph.getNextReadyBatch = jest.fn().mockReturnValue([]);

    let rafCallback: (() => void) | null = null;
    platform.now = jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(100).mockReturnValue(0);
    platform.requestAnimationFrame = jest.fn((cb: () => void) => {
      rafCallback = cb;
      return 1;
    });

    scheduler.resumePendingWork();
    expect(rafCallback).not.toBeNull();

    graph.pendingCount = 0;
    if (rafCallback) (rafCallback as unknown as () => void)();
    expect(platform.now).toHaveBeenCalledTimes(3);
  });

  it('handles generation mismatch when pending count becomes zero (no reschedule)', async () => {
    let pendingReads = 0;
    Object.defineProperty(graph, 'pendingCount', {
      configurable: true,
      get: () => {
        pendingReads += 1;
        if (pendingReads === 1) {
          scheduler.discardPendingWork();
          return 1;
        }
        return 0;
      },
    });

    scheduler.processScheduledBatch();
    expect(platform.queueMicrotask).not.toHaveBeenCalled();
    await expect(scheduler.waitForIdle()).resolves.toBeUndefined();
  });

  it('breaks out of loop if no ready formulas (line 164)', () => {
    graph.pendingCount = 1;
    graph.getNextReadyBatch = jest.fn().mockReturnValue([]); // no ready keys
    scheduler.resumePendingWork();
    expect(graph.markClean).not.toHaveBeenCalled();
  });

  it('handles viewport changed (line 213)', () => {
    graph.pendingCount = 1;
    platform.queueMicrotask = jest.fn();
    viewportChangedHandler();
    expect(platform.queueMicrotask).toHaveBeenCalled();

    platform.queueMicrotask.mockClear();
    viewportChangedHandler();
    expect(platform.queueMicrotask).not.toHaveBeenCalled();

    scheduler.discardPendingWork();
    graph.pendingCount = 0;
    viewportChangedHandler();
    expect(platform.queueMicrotask).not.toHaveBeenCalled();
  });

  it('marks only formulas backed by an invalidated external service dirty', () => {
    const languageKey = cellKey(0, 0);
    const ordinaryKey = cellKey(0, 1);
    astCache.set(languageKey, {
      kind: 'call',
      name: 'TRANSLATE',
      args: [{ kind: 'string', value: 'hello' }],
    });
    astCache.set(ordinaryKey, { kind: 'call', name: 'LEN', args: [{ kind: 'string', value: 'hello' }] });

    externalServiceInvalidatedHandler(['TRANSLATE', 'DETECTLANGUAGE']);

    expect(graph.markDirty).toHaveBeenCalledWith([languageKey]);
  });

  it('EvalContext edge cases (lines 234, 242-251)', () => {
    graph.pendingCount = 1;
    graph.getNextReadyBatch = jest
      .fn()
      .mockReturnValueOnce([cellKey(0, 0)])
      .mockReturnValueOnce([]);
    astCache.set(cellKey(0, 0), { kind: 'number', value: 1 });
    let ctx!: EvalContext;
    evaluator.evaluateBatch = jest.fn().mockImplementation((batch, context) => {
      ctx = context;
      return [];
    });

    scheduler.resumePendingWork();

    // getSheetShape
    expect(ctx.getSheetShape?.()).toEqual([10, 10]);

    // out of bounds cell
    const outOfBoundsCell = ctx.getCellValue(100, 100);
    expect(isFormulaError(outOfBoundsCell)).toBe(true);
    if (isFormulaError(outOfBoundsCell)) expect(outOfBoundsCell.code).toBe(FormulaErrorCode.Reference);

    // in bounds cell
    expect(ctx.getCellValue(0, 0)).toBe('0,0');

    // out of bounds iterateRange
    const iterErr = Array.from(ctx.iterateRange(100, 100, 101, 101));
    expect(isFormulaError(iterErr[0])).toBe(true);
    if (isFormulaError(iterErr[0])) expect(iterErr[0].code).toBe(FormulaErrorCode.Reference);

    // valid iterateRange
    const iterVal = Array.from(ctx.iterateRange(0, 0, 1, 1));
    expect(iterVal.length).toBe(4);
  });

  it('invalidates formula rendering after flushing derived results and displays formula values', () => {
    const results: EvalResult[] = [
      { key: cellKey(0, 0), value: 1 },
      { key: cellKey(0, 1), value: 'test' },
      { key: cellKey(0, 2), value: true },
      { key: cellKey(0, 3), value: createFormulaError(FormulaErrorCode.Value) },
      {
        key: cellKey(0, 4),
        value: { kind: 'text', value: 'hello', numericCoercion: 'allow' } satisfies FormulaText,
      },
      { key: cellKey(0, 5), value: [1, 2] },
      { key: cellKey(0, 6), value: [] },
      { key: cellKey(0, 7), value: false },
    ];

    resultStore.get.mockReturnValueOnce(10).mockReturnValue(undefined); // First one gets 10, rest get undefined (?? 0)

    graph.pendingCount = 1;
    graph.getNextReadyBatch = jest
      .fn()
      .mockReturnValueOnce(results.map((r) => r.key))
      .mockReturnValueOnce([]);

    // Add multiple astCache entries to cover getViewportKeys branches
    for (const res of results) astCache.set(res.key, { kind: 'number', value: 1 });
    astCache.set(cellKey(500, 500), { kind: 'number', value: 1 }); // outside viewport
    astCache.set(cellKey(0, 500), { kind: 'number', value: 1 }); // outside col
    astCache.set(cellKey(500, 0), { kind: 'number', value: 1 }); // outside row

    evaluator.evaluateBatch = jest.fn().mockReturnValue(results);

    scheduler.resumePendingWork();

    expect(resultStore.set).toHaveBeenCalledTimes(8);
    expect(renderInvalidator.publishResults).toHaveBeenCalledWith(results.map((result) => result.key));
    expect(trace.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: FormulaErrorChangedEventType,
        key: cellKey(0, 3),
        previousErrorCode: void 0,
        errorCode: FormulaErrorCode.Value,
      }),
    );
    expect(trace.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: FormulaBatchFlushedEventType,
        results: expect.arrayContaining([
          expect.objectContaining({
            key: cellKey(0, 0),
            previousResult: 10,
            result: 1,
          }),
        ]),
        pendingCount: 1,
      }),
    );
  });

  it('emits recalculation completion trace when pending formulas are clean', () => {
    const target = cellKey(0, 0);
    astCache.set(target, { kind: 'number', value: 1 });
    let pendingCount = 1;
    Object.defineProperty(graph, 'pendingCount', {
      configurable: true,
      get: () => pendingCount,
    });
    graph.getNextReadyBatch = jest.fn().mockReturnValue([target]);
    graph.markClean = jest.fn(() => {
      pendingCount = 0;
    });
    evaluator.evaluateBatch = jest.fn().mockReturnValue([{ key: target, value: 7 }]);

    scheduler.resumePendingWork();

    expect(trace.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: FormulaRecalculationCompletedEventType,
        batchCount: 1,
        flushedCellCount: 1,
        pendingCount: 0,
      }),
    );
  });

  it('resolves idle waiters only after pending formulas are clean', async () => {
    const target = cellKey(0, 0);
    astCache.set(target, { kind: 'number', value: 1 });
    let pendingCount = 1;
    Object.defineProperty(graph, 'pendingCount', {
      configurable: true,
      get: () => pendingCount,
    });
    graph.getNextReadyBatch = jest.fn().mockReturnValue([target]);
    graph.markClean = jest.fn(() => {
      pendingCount = 0;
    });
    evaluator.evaluateBatch = jest.fn().mockReturnValue([{ key: target, value: 7 }]);

    const idle = scheduler.waitForIdle();
    scheduler.resumePendingWork();

    await expect(idle).resolves.toBeUndefined();
    await expect(scheduler.waitForIdle()).resolves.toBeUndefined();
  });

  it('puts viewport formulas into the evaluated batch before off-screen formulas', () => {
    const visible = cellKey(0, 3);
    const offscreen = cellKey(500, 3);
    const dirtyKeys = [offscreen, visible];
    astCache.set(offscreen, { kind: 'number', value: 1 });
    astCache.set(visible, { kind: 'number', value: 2 });
    graph.pendingCount = 1;
    dataSource.getViewportFormulaKeys = jest.fn(() => new Set([visible]));
    graph.getNextReadyBatch = jest.fn((viewport: Set<CellKey>, maxCount: number) => {
      graph.pendingCount = 0;
      return [...dirtyKeys.filter((key) => viewport.has(key)), ...dirtyKeys.filter((key) => !viewport.has(key))].slice(
        0,
        maxCount,
      );
    });
    evaluator.evaluateBatch = jest.fn((batch: Array<{ key: CellKey }>) =>
      batch.map(({ key }) => ({ key, value: key === visible ? 20 : 10 })),
    );

    scheduler.resumePendingWork();

    expect(dataSource.getViewportFormulaKeys).toHaveBeenCalledWith(astCache.keys());
    expect(graph.getNextReadyBatch.mock.calls[0][0]).toEqual(new Set([visible]));
    expect(evaluator.evaluateBatch.mock.calls[0][0].map(({ key }: { key: CellKey }) => key)).toEqual([
      visible,
      offscreen,
    ]);
  });

  it('uses the formula render invalidator as a no-op bridge until assembly binds it', () => {
    const changes = new SheetDisplayedValueChanges(jest.fn());
    const invalidator = new FormulaValuePublisher(changes);
    expect(() => invalidator.publishResults([])).not.toThrow();
    expect(() => invalidator.publishResults([cellKey(0, 0)])).not.toThrow();

    const handler = jest.fn();
    const dispose = changes.subscribe(handler);
    invalidator.publishResults([cellKey(0, 1)]);
    expect(handler).toHaveBeenCalledWith([{ row: 0, column: 1 }]);

    dispose();
    expect(() => dispose()).not.toThrow();
    invalidator.publishResults([cellKey(0, 2)]);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
