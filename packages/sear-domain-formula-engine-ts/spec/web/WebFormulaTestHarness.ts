import { type EvalContext, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { NodeXmlXPathEvaluator } from '@searsuite/sear-assembly-headless';
import { AggregationCache, FormulaEvaluator, FormulaParser, FunctionRegistry } from '../../src';

export function webContext(data: Record<string, FormulaValue> = {}, services: Partial<EvalContext> = {}): EvalContext {
  return {
    xmlXPath: new NodeXmlXPathEvaluator(),
    isCellInBounds: (row, col) => row >= 0 && row < 10_000 && col >= 0 && col < 20,
    getSheetShape: () => [10_000, 20],
    getCellValue: (row, col) => data[`${row},${col}`] ?? '',
    *iterateRange(sr, sc, er, ec) {
      for (let row = sr; row <= er; row++) for (let col = sc; col <= ec; col++) yield data[`${row},${col}`] ?? '';
    },
    ...services,
  };
}

export function evaluateWeb(formula: string, context = webContext()): FormulaValue {
  return new FormulaEvaluator(new FunctionRegistry(), new AggregationCache()).evaluate(
    new FormulaParser().parse(formula),
    context,
  );
}

export const valueError = { kind: 'error', code: '#VALUE!' };
export const unavailableError = { kind: 'error', code: '#N/A' };
