/** @jest-environment node */

import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { FunctionRegistry } from '../src/functions';
import { FormulaExternalServiceRegistry } from '../src/FormulaExternalServiceRegistry';
import { NodeXmlXPathEvaluator } from '@searsuite/sear-assembly-headless';
import {
  FormulaAddInServiceDefinition,
  FormulaCubeServiceDefinition,
  FormulaImageServiceDefinition,
  FormulaLanguageServiceDefinition,
  FormulaPivotDataServiceDefinition,
  FormulaRtdServiceDefinition,
  FormulaServiceCacheStatus,
  FormulaStockHistoryServiceDefinition,
  FormulaWebServiceDefinition,
  FormulaGoogleServiceDefinition,
  type EvalContext,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import cases from '@searsuite-test/formula-coverage-cases';

const services = new FormulaExternalServiceRegistry();
services.register(FormulaAddInServiceDefinition, {
  resolveRegistration: () => ({ status: FormulaServiceCacheStatus.Ready, value: 1 }),
  call: () => ({ status: FormulaServiceCacheStatus.Ready, value: 42 }),
});
services.register(FormulaWebServiceDefinition, {
  read: () => ({ status: 'ready', value: '<r><v>42</v></r>' }),
  subscribeInvalidation: () => () => void 0,
});
services.register(FormulaLanguageServiceDefinition, {
  detectLanguage: () => ({ status: 'ready', value: 'en' }),
  translate: () => ({ status: 'ready', value: 'translated' }),
});
services.register(FormulaImageServiceDefinition, {
  read: (source: string) => ({ status: FormulaServiceCacheStatus.Ready, value: { assetId: source, source } }),
  subscribeInvalidation: () => () => void 0,
});
services.register(FormulaPivotDataServiceDefinition, {
  getData: () => 42,
});
services.register(FormulaRtdServiceDefinition, {
  read: () => ({ status: FormulaServiceCacheStatus.Ready, value: 42 }),
  subscribeInvalidation: () => () => void 0,
});
services.register(FormulaCubeServiceDefinition, {
  read: (query) => ({
    status: FormulaServiceCacheStatus.Ready,
    value:
      query.kind === 'set'
        ? {
            kind: 'cube-set',
            connection: query.connection,
            expression: query.expression,
            caption: query.caption ?? query.expression,
            count: 1,
          }
        : query.kind === 'set-count'
        ? 1
        : query.kind === 'member-property'
        ? 'Member property'
        : query.kind === 'value'
        ? 42
        : {
            kind: 'cube-member',
            connection: query.connection,
            expression: query.kind === 'kpi-member' ? query.kpiName : 'Member',
            caption: query.caption ?? 'Member',
          },
  }),
  subscribeInvalidation: () => () => void 0,
});
services.register(FormulaStockHistoryServiceDefinition, {
  read: () => ({
    status: FormulaServiceCacheStatus.Ready,
    value: [
      ['Date', 'Close'],
      [45_000, 100],
    ],
  }),
  subscribeInvalidation: () => () => void 0,
});
services.register(FormulaGoogleServiceDefinition, {
  read: () => ({ status: FormulaServiceCacheStatus.Ready, value: [['cached']] }),
  subscribeInvalidation: () => () => void 0,
});

const context: EvalContext = {
  isCellInBounds: (row, column) => row >= 0 && row < 10_000 && column >= 0 && column < 20,
  getSheetShape: () => [10_000, 20],
  getCellValue: (row, column) => (column === 1 ? `Item ${row % 10}` : (row % 100) * (column === 2 ? 2 : 1)),
  getWorkbookCellValue: () => 1,
  *iterateRange(startRow, startColumn, endRow, endColumn): Iterable<FormulaValue> {
    for (let row = startRow; row <= endRow; row++) {
      for (let column = startColumn; column <= endColumn; column++) yield context.getCellValue(row, column);
    }
  },
  *iterateWorkbookRange(_sheet, startRow, startColumn, endRow, endColumn): Iterable<FormulaValue> {
    for (let row = startRow; row <= endRow; row++) {
      for (let column = startColumn; column <= endColumn; column++) yield row + column + 1;
    }
  },
  random: () => 0.5,
  currentDateTime: () => Date.UTC(2024, 0, 1, 12),
  externalServices: services,
  xmlXPath: new NodeXmlXPathEvaluator(),
  formulaSource: { getFormulaSource: () => '=1' },
  referenceResolver: {
    resolve: () => ({ source: { kind: 'currentSheet' }, startRow: 0, startCol: 0, endRow: 0, endCol: 0 }),
  },
  readReference: () => 42,
  currentCell: { row: 1, col: 1 },
  metadata: {
    readCell: (reference) => ({
      reference,
      source: reference.row === 0 ? 'empty' : 'formula',
      value: 42,
      formula: '=40+2',
      numberFormat: '0.00',
    }),
    readWorkbook: () => ({
      currentSheetId: 's1',
      currentSheetName: 'Sheet1',
      sheets: [
        { id: 's1', name: 'Sheet1', index: 1 },
        { id: 's2', name: 'Sheet2', index: 2 },
      ],
    }),
    readEnvironment: () => ({ operatingSystem: 'Test OS', version: '1.0', system: 'test' }),
  },
};
const builtInCases = cases.filter(({ name }) => new FunctionRegistry().has(name));

describe('complete built-in formula execution coverage', () => {
  it('has exactly one execution case for every registered function', () => {
    const names = builtInCases.map(({ name }) => name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.sort()).toEqual(new FunctionRegistry().list().sort());
  });

  it.each(builtInCases)('$name executes its own valid calculation path', ({ name, formula }) => {
    const registry = new FunctionRegistry();
    const fn = registry.get(name)!;
    const evaluate = jest.fn(fn.evaluate.bind(fn));
    registry.register({ ...fn, evaluate });
    const evaluator = new FormulaEvaluator(registry, new AggregationCache());
    const parser = new FormulaParser();
    const result = evaluator.evaluate(parser.parse(formula), context);
    expect(evaluate).toHaveBeenCalled();
    expect(result).not.toEqual(expect.objectContaining({ kind: 'error' }));
  });

  it.each(builtInCases)('$name handles omitted and incompatible arguments as formula-domain results', ({ name }) => {
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
    const parser = new FormulaParser();
    const formulas = [
      `=${name}()`,
      `=${name}("text")`,
      `=${name}(0)`,
      `=${name}(1)`,
      `=${name}(TRUE)`,
      `=${name}(1,2)`,
      `=${name}(-1,0,FALSE)`,
      `=${name}("","",TRUE)`,
      `=${name}({1,2,"text",TRUE})`,
      `=${name}({1;2;3},{3;2;1},TRUE)`,
      `=${name}(1/0)`,
    ];

    for (const formula of formulas) {
      expect(() => evaluator.evaluate(parser.parse(formula), context)).not.toThrow();
    }
  });
});
