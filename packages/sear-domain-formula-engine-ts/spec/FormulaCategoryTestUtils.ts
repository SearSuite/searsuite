import { type EvalContext, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { FunctionRegistry } from '../src/functions';

export function evaluateCategoryFormula(
  formula: string,
  values: Readonly<Record<string, FormulaValue>> = {},
  overrides: Partial<EvalContext> = {},
): FormulaValue {
  const context: EvalContext = {
    isCellInBounds: (row, col) => row >= 0 && row < 100_000 && col >= 0 && col < 100,
    getSheetShape: () => [100_000, 100],
    getCellValue: (row, col) => values[`${row},${col}`] ?? 0,
    getWorkbookCellValue: (sheet, row, col) => values[`${sheet}:${row},${col}`] ?? 0,
    *iterateRange(startRow, startCol, endRow, endCol) {
      for (let row = startRow; row <= endRow; row++) for (let col = startCol; col <= endCol; col++) yield values[`${row},${col}`] ?? 0;
    },
    *iterateWorkbookRange(sheet, startRow, startCol, endRow, endCol) {
      for (let row = startRow; row <= endRow; row++) for (let col = startCol; col <= endCol; col++) yield values[`${sheet}:${row},${col}`] ?? 0;
    },
    ...overrides,
  };
  return new FormulaEvaluator(new FunctionRegistry(), new AggregationCache()).evaluate(new FormulaParser().parse(formula), context);
}

export function expectClose(value: FormulaValue, expected: number, precision = 6): void {
  expect(typeof value).toBe('number');
  expect(value as number).toBeCloseTo(expected, precision);
}
