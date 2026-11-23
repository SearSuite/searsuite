import {
  FormulaErrorCode,
  FormulaServiceCacheStatus,
  type EvalContext,
  type FormulaStockHistoryRequest,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { AggregationCache } from '../src/AggregationCache';
import { FormulaExecutionBudget } from '../src/FormulaExecutionBudget';
import { FormulaLexicalScope } from '../src/FormulaLexicalScope';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { FormulaStockHistoryCache } from '../src/FormulaStockHistoryCache';
import { FunctionRegistry } from '../src/functions';

describe('formula runtime infrastructure', () => {
  const parser = new FormulaParser();
  const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());

  function context(overrides: Partial<EvalContext> = {}): EvalContext {
    return {
      isCellInBounds: () => true,
      getCellValue: () => 0,
      iterateRange: () => [],
      ...overrides,
    };
  }

  it('evaluates LET bindings sequentially', () => {
    const result = evaluator.evaluate(parser.parse('=LET(factor,3,value,4,value*factor)'), context());
    expect(result).toBe(12);
  });

  it('uses case-insensitive lexical scopes with child shadowing', () => {
    const parent = new FormulaLexicalScope();
    const child = new FormulaLexicalScope(parent);
    parent.set('Rate', 2);
    child.set('RATE', 5);
    expect(parent.get('rate')).toBe(2);
    expect(child.get('rate')).toBe(5);
  });

  it('returns #NUM! when the execution step budget is exhausted', () => {
    const result = evaluator.evaluate(parser.parse('=1+2'), context({ budget: new FormulaExecutionBudget(1) }));
    expect(result).toEqual({ kind: 'error', code: FormulaErrorCode.Number });
  });

  it('exposes platform-neutral cell and workbook metadata through EvalContext', () => {
    const evalContext = context({
      metadata: {
        readCell: (reference) => ({ reference, source: 'formula', value: 42, formula: '=40+2' }),
        readWorkbook: () => ({
          currentSheetId: 'sheet-1',
          currentSheetName: 'Data',
          sheets: [{ id: 'sheet-1', name: 'Data', index: 1 }],
        }),
      },
    });
    expect(evalContext.metadata?.readCell({ row: 0, col: 0 })?.source).toBe('formula');
    expect(evalContext.metadata?.readWorkbook?.()?.sheets[0].index).toBe(1);
  });

  it('keeps STOCKHISTORY loading outside synchronous reads and invalidates after completion', async () => {
    const request: FormulaStockHistoryRequest = {
      stock: 'MSFT',
      startDate: 45_000,
      interval: 0,
      headers: 1,
      properties: [0, 1],
    };
    const rows: FormulaValue[][] = [['Date', 'Close'], [45_000, 100]];
    const loader = jest.fn(async () => rows);
    const invalidated = jest.fn();
    const cache = new FormulaStockHistoryCache(loader);
    cache.subscribeInvalidation(invalidated);

    expect(cache.read(request)).toEqual({ status: FormulaServiceCacheStatus.Unavailable });
    expect(loader).not.toHaveBeenCalled();
    const pending = cache.load(request);
    expect(cache.read(request)).toEqual({ status: FormulaServiceCacheStatus.Pending });
    await pending;
    expect(cache.read(request)).toEqual({ status: FormulaServiceCacheStatus.Ready, value: rows });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(invalidated).toHaveBeenCalledTimes(1);
  });
});
