import { AggregationCache } from '../src/AggregationCache';
import { FormulaEvaluator } from '../src/FormulaEvaluator';
import { FormulaParser } from '../src/FormulaParser';
import { FunctionRegistry } from '../src/functions';
import {
  FormulaFunctionArguments,
  FormulaNodeKind,
  type EvalContext,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';

function context(overrides: Partial<EvalContext> = {}): EvalContext {
  return {
    isCellInBounds: () => true,
    getCellValue: () => 0,
    iterateRange: () => [],
    ...overrides,
  };
}

describe('formula reference infrastructure', () => {
  it('retains explicit and resolved references through the argument SDK', () => {
    const reference = {
      source: { kind: 'currentSheet' as const },
      startRow: 1,
      startCol: 2,
      endRow: 3,
      endCol: 4,
    };
    const reader = new FormulaFunctionArguments(
      [{ kind: 'reference', reference }],
      context({ readReference: () => [[1, 2, 3]] }),
    );

    expect(reader.reference(0)).toEqual(reference);
    expect(reader.value(0)).toEqual([[1, 2, 3]]);
  });

  it('scopes each batch result to its formula cell position', () => {
    const registry = new FunctionRegistry();
    registry.register({
      name: 'CURRENTCELL',
      evaluate: (_args, evaluationContext): FormulaValue => {
        const cell = evaluationContext.currentCell;
        return cell ? `${cell.row},${cell.col}` : 'missing';
      },
    });
    const evaluator = new FormulaEvaluator(registry, new AggregationCache());
    const parser = new FormulaParser();
    const results = evaluator.evaluateBatch(
      [
        { key: 0, ast: parser.parse('=CURRENTCELL()') },
        { key: 65537, ast: parser.parse('=CURRENTCELL()') },
      ],
      context(),
    );

    expect(results.map((result) => result.value)).toEqual(['0,0', '1,1']);
  });

  it('supports workbook references through the reference reader', () => {
    const reader = new FormulaFunctionArguments(
      [
        {
          kind: FormulaNodeKind.WorkbookRange,
          sheetName: 'Sheet2',
          start: [0, 0],
          end: [0, 1],
        },
      ],
      context(),
    );
    expect(reader.reference(0)).toEqual({
      source: { kind: 'workbookSheet', sheetName: 'Sheet2' },
      startRow: 0,
      startCol: 0,
      endRow: 0,
      endCol: 1,
    });
  });

  it('keeps coercion and optional-argument behavior available to future reference functions', () => {
    const reader = new FormulaFunctionArguments(
      [
        { kind: 'expression', ast: { kind: FormulaNodeKind.Number, value: 7 } },
        { kind: FormulaNodeKind.Cell, row: 1, col: 2 },
        { kind: FormulaNodeKind.WorkbookCell, sheetName: 'Sheet2', row: 0, col: 0 },
        { kind: 'value', value: [1, 2] },
        { kind: 'value', value: true },
        { kind: 'value', value: 2 },
        { kind: 'value', value: 'TRUE' },
        { kind: 'value', value: 'nope' },
      ],
      context({
        evaluateFormula: () => 7,
        getCellValue: () => 8,
        getWorkbookCellValue: () => 9,
      }),
    );

    expect(reader.value(0)).toBe(7);
    expect(reader.value(1)).toBe(8);
    expect(reader.value(2)).toBe(9);
    expect(reader.value(99)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(reader.text(4)).toBe('TRUE');
    expect(reader.text(5)).toBe('2');
    expect(reader.text(3)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(reader.number(5)).toBe(2);
    expect(reader.number(4)).toBe(1);
    expect(reader.number(3)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(reader.boolean(4)).toBe(true);
    expect(reader.boolean(5)).toBe(true);
    expect(reader.boolean(6)).toBe(true);
    expect(reader.boolean(7)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(reader.number(99, 12)).toBe(12);
    expect(reader.boolean(99, false)).toBe(false);
    expect(reader.text(99, 'fallback')).toBe('fallback');
    expect(reader.integer(5)).toBe(2);
    expect(reader.isMissing(99)).toBe(true);
  });

  it('normalizes every supported reference argument shape', () => {
    const reader = new FormulaFunctionArguments(
      [
        { kind: FormulaNodeKind.Range, start: [1, 2], end: [3, 4] },
        { kind: FormulaNodeKind.Cell, row: 1, col: 2 },
        { kind: FormulaNodeKind.WorkbookCell, sheetName: 'Sheet2', row: 0, col: 0 },
        { kind: FormulaNodeKind.WorkbookRange, sheetName: 'Sheet2', start: [0, 0], end: [1, 1] },
        { kind: 'value', value: 1 },
      ],
      context(),
    );
    expect(reader.reference(0)).toMatchObject({ startRow: 1, endCol: 4 });
    expect(reader.reference(1)).toMatchObject({ startRow: 1, endRow: 1 });
    expect(reader.reference(2)).toMatchObject({ source: { kind: 'workbookSheet', sheetName: 'Sheet2' } });
    expect(reader.reference(3)).toMatchObject({ endRow: 1, endCol: 1 });
    expect(reader.reference(4)).toEqual({ kind: 'error', code: '#VALUE!' });
    expect(reader.reference(99)).toEqual({ kind: 'error', code: '#VALUE!' });
  });
});
