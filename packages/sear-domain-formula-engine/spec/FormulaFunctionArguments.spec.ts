import {
  FormulaFunctionArguments,
  FormulaErrorCode,
  FormulaNodeKind,
  isFormulaArgumentKind,
  type EvalContext,
  type FormulaArg,
} from '../src';

const context: EvalContext = {
  isCellInBounds: () => true,
  getSheetShape: () => [1, 1],
  getCellValue: () => 7,
  iterateRange: () => [],
};

describe('FormulaFunctionArguments', () => {
  it('narrows arguments through the shared kind guard', () => {
    const arg: FormulaArg = { kind: FormulaNodeKind.Cell, row: 2, col: 3 };
    expect(isFormulaArgumentKind(arg, FormulaNodeKind.Cell)).toBe(true);
    expect(isFormulaArgumentKind(arg, FormulaNodeKind.Range, FormulaNodeKind.WorkbookRange)).toBe(false);
    expect(isFormulaArgumentKind(undefined, 'missing')).toBe(false);
  });

  it('provides stable scalar coercion for third-party functions', () => {
    const args: FormulaArg[] = [
      { kind: 'value', value: '12.5' },
      { kind: 'value', value: true },
      { kind: 'cell', row: 0, col: 0 },
    ];
    const reader = new FormulaFunctionArguments(args, context);
    expect(reader.number(0)).toBe(12.5);
    expect(reader.text(1)).toBe('TRUE');
    expect(reader.integer(2)).toBe(7);
    expect(reader.text(3, 'fallback')).toBe('fallback');
  });

  it('returns formula errors for unsupported coercions', () => {
    const reader = new FormulaFunctionArguments([{ kind: 'value', value: 'nope' }], context);
    expect(reader.number(0)).toEqual({ kind: 'error', code: FormulaErrorCode.Value });
  });
});
