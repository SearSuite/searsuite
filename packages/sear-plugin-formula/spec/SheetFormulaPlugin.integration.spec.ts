import { AggregationCache } from '@searsuite/sear-domain-formula-engine-ts';
import { DependencyGraph } from '@searsuite/sear-domain-formula-engine-ts';
import { FormulaEvaluator } from '@searsuite/sear-domain-formula-engine-ts';
import { FormulaParser } from '@searsuite/sear-domain-formula-engine-ts';
import { FunctionRegistry } from '@searsuite/sear-domain-formula-engine-ts';
import { FormulaErrorCode, createFormulaError } from '@searsuite/sear-domain-formula-engine';
import { CellType } from '@searsuite/sear-domain-cell-types';
import { SheetDataPlugin } from '@searsuite/sear-render-engine';
import { MatrixOTActionName, type Operation } from '@searsuite/sear-domain-ot';
import { createTransaction, Transaction } from '@searsuite/sear-domain-transaction';
import { type Platform } from '@searsuite/sear-foundation-platform';
import { CellFormulaValueConverterRegistry } from '../src/CellFormulaValueConverterRegistry';
import { FormulaRefShifter } from '../src/FormulaRefShifter';
import { FormulaCalculationTraceBus } from '../src/FormulaCalculationTraceBus';
import { FormulaRenderInvalidator } from '../src/FormulaRenderInvalidator';
import { SheetDisplayedValueChanges } from '@searsuite/sear-domain-cell-types';
import { FormulaResultStore } from '../src/FormulaResultStore';
import { type FormulaSchedulerDataSource } from '../src/FormulaSchedulerDataSource';
import { RecalcScheduler } from '../src/RecalcScheduler';
import { SheetFormulaPlugin } from '../src/sheetFormula/SheetFormulaPlugin';

interface Cell {
  type: string;
  value?: unknown;
  formula?: string;
}

function createPlatform(): Platform {
  return {
    queueMicrotask(callback: () => void): void {
      callback();
    },
    now: () => 0,
    currentDateTime: () => 0,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    warn: () => {},
    createId: (prefix = 'test') => `${prefix}-1`,
    toLowerCase: (value: string) => value.toLowerCase(),
    addEventListener: () => () => {},
    observeResize: () => () => {},
    readViewOffset: () => ({ x: 0, y: 0 }),
  } as Platform;
}

describe('SheetFormulaPlugin integration', () => {
  it('updates dependency graph, recalculates, and exposes the derived result after an edit', () => {
    const cells: Cell[][] = [
      [
        { type: CellType.Number, value: 1 },
        { type: CellType.Formula, formula: '=A1+1' },
      ],
    ];
    const platform = createPlatform();
    const parser = new FormulaParser();
    const graph = new DependencyGraph();
    const cache = new AggregationCache();
    const resultStore = new FormulaResultStore(new CellFormulaValueConverterRegistry(platform));
    const trace = new FormulaCalculationTraceBus(platform);
    const dataSource: FormulaSchedulerDataSource = {
      createEvalContext: (_resultStore: FormulaResultStore) => ({
        isCellInBounds: (row: number, col: number): boolean => row >= 0 && row < 1 && col >= 0 && col < 2,
        getSheetShape: (): [number, number] => [1, 2],
        getCellValue: (row: number, col: number) =>
          row >= 0 && row < 1 && col >= 0 && col < 2
            ? resultStore.cellToFormulaValue(row, col, cells[row][col] ?? null)
            : createFormulaError(FormulaErrorCode.Reference),
        iterateRange: (startRow: number, startCol: number, endRow: number, endCol: number) => {
          if (startRow < 0 || startCol < 0 || endRow >= 1 || endCol >= 2) {
            return [createFormulaError(FormulaErrorCode.Reference)];
          }
          return {
            *[Symbol.iterator]() {
              for (let row = startRow; row <= endRow; row++) {
                for (let col = startCol; col <= endCol; col++) {
                  yield resultStore.cellToFormulaValue(row, col, cells[row][col] ?? null);
                }
              }
            },
          };
        },
      }),
      getViewportFormulaKeys: (keys: Iterable<number>) => new Set(keys),
      onViewportChanged: () => () => {},
    };
    const scheduler = new RecalcScheduler(
      graph,
      new FormulaEvaluator(new FunctionRegistry(), cache),
      resultStore,
      cache,
      dataSource,
      platform,
      new FormulaRenderInvalidator(new SheetDisplayedValueChanges(jest.fn())),
      trace,
    );
    const plugin = new SheetFormulaPlugin(
      parser,
      graph,
      cache,
      resultStore,
      scheduler,
      new FormulaRefShifter(parser),
      trace,
    );

    function applyCellEdit(row: number, col: number, next: Cell, previous: Cell): void {
      cells[row][col] = next;
      const transaction = createTransaction(SheetDataPlugin.pluginKey);
      transaction.addOperation([
        {
          p: [row, col],
          [MatrixOTActionName.UpdateCell]: { value: next, prev: previous },
        } as unknown as Operation,
      ]);
      plugin.apply(plugin.getState(), transaction);
      plugin.onTransactionCommitted(transaction);
    }

    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      applyCellEdit(0, 1, cells[0][1], { type: CellType.Empty });
      expect(plugin.getFormulaResult(0, 1)).toBe(2);

      applyCellEdit(0, 0, { type: CellType.Number, value: 10 }, { type: CellType.Number, value: 1 });
      expect(plugin.getFormulaResult(0, 1)).toBe(11);
    } finally {
      log.mockRestore();
    }
  });
});
