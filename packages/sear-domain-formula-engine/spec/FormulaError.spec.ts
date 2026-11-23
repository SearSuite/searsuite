import { createFormulaError, FormulaErrorCode, isFormulaErrorCode } from '../src';

describe('formula errors', () => {
  it('creates stable serializable Excel-compatible error values', () => {
    expect(createFormulaError(FormulaErrorCode.DivisionByZero)).toEqual({
      kind: 'error',
      code: '#DIV/0!',
    });
    expect(createFormulaError(FormulaErrorCode.Reference)).toEqual({
      kind: 'error',
      code: '#REF!',
    });
  });

  it('validates runtime formula error codes before constructing error values', () => {
    const validCode: unknown = '#VALUE!';
    const invalidCode: unknown = '#BAD!';
    const createFromRuntime = createFormulaError as unknown as (code: unknown) => unknown;

    expect(isFormulaErrorCode(validCode)).toBe(true);
    expect(isFormulaErrorCode(invalidCode)).toBe(false);
    expect(() => createFromRuntime(invalidCode)).toThrow('Invalid formula error code');
  });
});
