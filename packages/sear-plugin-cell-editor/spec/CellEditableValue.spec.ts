import { getCellEditableValue } from '../src/CellEditableValue';

describe('getCellEditableValue', () => {
  it('returns the persisted formula source instead of a formula result', () => {
    expect(
      getCellEditableValue({
        type: 'formula',
        formula: '=SUM(A1:A3)',
        value: 42,
      }),
    ).toBe('=SUM(A1:A3)');
  });

  it('uses a formula source provider before the persisted formula text', () => {
    expect(
      getCellEditableValue(
        {
          type: 'formula',
          formula: '=OldName!A1',
          value: 42,
        },
        { row: 0, col: 0 },
        { getFormulaSource: () => '=NewName!A1' },
      ),
    ).toBe('=NewName!A1');
  });

  it('continues to return value for ordinary and legacy formula cells', () => {
    expect(getCellEditableValue({ type: 'richtext', value: 'hello' })).toBe('hello');
    expect(getCellEditableValue({ type: 'formula', value: '=A1+1' })).toBe('=A1+1');
  });

  it('handles null or undefined cell', () => {
    expect(getCellEditableValue(null)).toBeUndefined();
    expect(getCellEditableValue(undefined)).toBeUndefined();
  });

  it('returns undefined when neither formula nor value exists for formula type', () => {
    expect(getCellEditableValue({ type: 'formula' })).toBeUndefined();
  });
});
