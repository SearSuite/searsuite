import { MatrixOTActionName } from '@searsuite/sear-domain-ot';
import {
  FormulaErrorCode,
  type EvalContext,
  type FormulaValue,
  type ResolvedFormulaRange,
} from '@searsuite/sear-domain-formula-engine';
import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { ChineseExcelDateTimeLocale, FunctionRegistry } from '../src/functions';
import { formulaSemanticCases, type FormulaSemanticCase } from './fixtures/formula-semantic-cases';

type CellValues = Readonly<Record<string, FormulaValue>>;

interface SemanticContextOptions {
  readonly cells?: CellValues;
  readonly workbookCells?: CellValues;
  readonly shape?: readonly [number, number];
  readonly dateTimeLocale?: EvalContext['dateTimeLocale'];
  readonly currentDateTime?: number;
}

function createContext(options: SemanticContextOptions = {}): EvalContext {
  const cells = options.cells ?? {};
  const workbookCells = options.workbookCells ?? {};
  const shape = options.shape ?? [100, 100];
  const hasCell = (row: number, col: number): boolean => row >= 0 && row < shape[0] && col >= 0 && col < shape[1];
  const readCell = (row: number, col: number): FormulaValue => cells[`${row},${col}`] ?? 0;
  const readWorkbookCell = (sheet: string, row: number, col: number): FormulaValue =>
    workbookCells[`${sheet}:${row},${col}`] ?? 0;

  return {
    isCellInBounds: hasCell,
    getSheetShape: () => [shape[0], shape[1]],
    getCellValue: readCell,
    getWorkbookCellValue: readWorkbookCell,
    *iterateRange(startRow, startCol, endRow, endCol) {
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) yield readCell(row, col);
      }
    },
    *iterateWorkbookRange(sheet, startRow, startCol, endRow, endCol) {
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) yield readWorkbookCell(sheet, row, col);
      }
    },
    ...(options.dateTimeLocale === void 0 ? {} : { dateTimeLocale: options.dateTimeLocale }),
    ...(options.currentDateTime === void 0 ? {} : { currentDateTime: () => options.currentDateTime as number }),
  };
}

function evaluateCase(testCase: FormulaSemanticCase): FormulaValue {
  const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
  const locale = testCase.dateTimeLocale === 'chinese' ? ChineseExcelDateTimeLocale : void 0;
  const options: SemanticContextOptions = {
    ...(testCase.cells === void 0 ? {} : { cells: testCase.cells }),
    ...(testCase.workbookCells === void 0 ? {} : { workbookCells: testCase.workbookCells }),
    ...(testCase.shape === void 0 ? {} : { shape: testCase.shape }),
    ...(locale === void 0 ? {} : { dateTimeLocale: locale }),
    ...(testCase.currentDateTime === void 0 ? {} : { currentDateTime: testCase.currentDateTime }),
  };
  return evaluator.evaluate(new FormulaParser().parse(testCase.formula), createContext(options));
}

describe('formula semantic compatibility corpus', () => {
  it.each(formulaSemanticCases)('$id: $rule', (testCase) => {
    expect(evaluateCase(testCase)).toEqual(testCase.expected);
  });

  it('keeps corpus identifiers unique and every case categorized', () => {
    const ids = formulaSemanticCases.map((testCase) => testCase.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      formulaSemanticCases.every(
        (testCase) => testCase.rule.length > 0 && testCase.oracle.length > 0 && testCase.oracleVersion.length > 0,
      ),
    ).toBe(true);
  });

  it('records dynamic dependencies for INDIRECT and reads the resolved reference', () => {
    const dependencies: ResolvedFormulaRange[] = [];
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
    const context: EvalContext = {
      ...createContext(),
      referenceResolver: {
        resolve: () => ({
          source: { kind: 'currentSheet' },
          startRow: 1,
          startCol: 1,
          endRow: 1,
          endCol: 1,
        }),
      },
      readReference: () => 42,
      registerDynamicDependency: (reference) => dependencies.push(reference),
    };

    expect(evaluator.evaluate(new FormulaParser().parse('=INDIRECT("B2")'), context)).toBe(42);
    expect(dependencies).toEqual([
      {
        source: { kind: 'currentSheet' },
        startRow: 1,
        startCol: 1,
        endRow: 1,
        endCol: 1,
      },
    ]);
  });

  it('keeps cached range results equivalent to a full recalculation after a cell change', () => {
    const cells: Record<string, FormulaValue> = { '0,0': 10, '1,0': 20, '2,0': 30 };
    const cache = new AggregationCache();
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), cache);
    const ast = new FormulaParser().parse('=SUM(A1:A3)');
    const context = createContext({ cells, shape: [3, 1] });

    expect(evaluator.evaluate(ast, context)).toBe(60);
    cells['1,0'] = 50;
    cache.onCellChanged(1, 0, 20, 50);
    expect(evaluator.evaluate(ast, context)).toBe(90);
    expect(new FormulaEvaluator(new FunctionRegistry(), new AggregationCache()).evaluate(ast, context)).toBe(90);
  });

  it('preserves formula meaning after a row insertion rebases references', () => {
    const parser = new FormulaParser();
    const original = parser.parse('=A1+B2');
    const shifted = parser.shiftReferences(original, [{ type: MatrixOTActionName.RowInsert, index: 0, count: 1 }]);
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());

    expect(
      evaluator.evaluate(
        shifted,
        createContext({
          cells: { '1,0': 2, '2,1': 3 },
          shape: [3, 2],
        }),
      ),
    ).toBe(5);
  });
});

describe('formula semantic properties', () => {
  it('keeps SUM equal to a direct reduction for generated numeric ranges', () => {
    let state = 0x5eed1234;
    const random = (): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    };
    const parser = new FormulaParser();
    const ast = parser.parse('=SUM(A1:D4)');

    for (let iteration = 0; iteration < 64; iteration++) {
      const cells: Record<string, FormulaValue> = {};
      let expected = 0;
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          const value = Math.floor(random() * 2001) - 1000;
          cells[`${row},${col}`] = value;
          expected += value;
        }
      }
      const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
      expect(evaluator.evaluate(ast, createContext({ cells, shape: [4, 4] }))).toBe(expected);
    }
  });

  it('keeps spreadsheet error codes stable across the core error cases', () => {
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
    const parser = new FormulaParser();
    const cases: readonly [string, FormulaValue][] = [
      ['=1/0', { kind: 'error', code: FormulaErrorCode.DivisionByZero }],
      ['=NA()', { kind: 'error', code: FormulaErrorCode.NotAvailable }],
      ['=A2', { kind: 'error', code: FormulaErrorCode.Reference }],
      ['=UNKNOWN_FUNCTION()', { kind: 'error', code: FormulaErrorCode.Name }],
    ];

    for (const [formula, expected] of cases) {
      expect(evaluator.evaluate(parser.parse(formula), createContext({ shape: [1, 1] }))).toEqual(expected);
    }
  });
});
