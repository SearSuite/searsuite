import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { FunctionRegistry } from '../src/functions';
import { excelGoldenCases } from './fixtures/excel-golden';
import {
  FormulaErrorCode,
  createFormulaError,
  type EvalContext,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';

function createContext(cells: Record<string, FormulaValue>, shape: [number, number]): EvalContext {
  return {
    isCellInBounds: (row, col) => row >= 0 && row < shape[0] && col >= 0 && col < shape[1],
    getSheetShape: () => shape,
    getCellValue: (row, col) => cells[`${row},${col}`] ?? 0,
    *iterateRange(startRow, startCol, endRow, endCol) {
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) yield cells[`${row},${col}`] ?? 0;
      }
    },
  };
}

describe('offline Excel/LibreOffice golden cases', () => {
  const parser = new FormulaParser();

  it.each(excelGoldenCases)('$name', ({ formula, cells, shape, expected }) => {
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
    expect(evaluator.evaluate(parser.parse(formula), createContext(cells, shape))).toEqual(expected);
  });

  it('evaluates workbook-qualified cells and ranges through EvalContext workbook readers', () => {
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
    const context = createContext({}, [2, 2]);
    const workbookValues: Record<string, FormulaValue> = {
      'Sheet2:0,0': 2,
      'Sales Data:0,0': 1,
      'Sales Data:0,1': 2,
      'Sales Data:1,0': 3,
      'Sales Data:1,1': 4,
    };
    context.getWorkbookCellValue = (sheetName, row, col) => workbookValues[`${sheetName}:${row},${col}`] ?? 0;
    context.iterateWorkbookRange = function* iterateWorkbookRange(sheetName, startRow, startCol, endRow, endCol) {
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) yield workbookValues[`${sheetName}:${row},${col}`] ?? 0;
      }
    };

    expect(evaluator.evaluate(parser.parse('=Sheet2!A1+1'), context)).toBe(3);
    expect(evaluator.evaluate(parser.parse("=SUM('Sales Data'!A1:B2)"), context)).toBe(10);
  });

  it('returns #REF! for workbook references when no workbook reader is provided', () => {
    const evaluator = new FormulaEvaluator(new FunctionRegistry(), new AggregationCache());
    expect(evaluator.evaluate(parser.parse('=Sheet2!A1'), createContext({}, [2, 2]))).toEqual(
      createFormulaError(FormulaErrorCode.Reference),
    );
  });
});
