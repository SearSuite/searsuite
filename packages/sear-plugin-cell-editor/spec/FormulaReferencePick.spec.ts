import {
  canPickFormulaReference,
  canStartFormulaReferencePick,
  findTrailingSheetQualifierStart,
  formatPickedReference,
} from '../src/formulaAssist/formatPickedReference';

describe('formula reference picking', () => {
  it('formats cells, ranges and workbook sheet names', () => {
    expect(formatPickedReference([1, 1], [1, 1])).toBe('B2');
    expect(formatPickedReference([3, 3], [1, 1])).toBe('B2:D4');
    expect(formatPickedReference([1, 1], [1, 1], 'Sheet2')).toBe('Sheet2!B2');
    expect(formatPickedReference([1, 1], [1, 1], "Bob's Data")).toBe("'Bob''s Data'!B2");
    expect(formatPickedReference([0, 1], [199, 3], undefined, 'column')).toBe('B:D');
    expect(formatPickedReference([1, 0], [3, 49], undefined, 'row')).toBe('2:4');
    expect(formatPickedReference([0, 0], [199, 0], 'Sheet2', 'column')).toBe('Sheet2!A:A');
  });

  it('does not turn a click inside a quoted string into a reference', () => {
    expect(canPickFormulaReference('=SUM(', 5)).toBe(true);
    expect(canPickFormulaReference('="hello', 7)).toBe(false);
    expect(canPickFormulaReference('="a"&', 5)).toBe(true);
    expect(canPickFormulaReference("='Sales Data'!B2", 7)).toBe(false);
    expect(canPickFormulaReference("='Sales Data'!B2+", 17)).toBe(true);
    expect(canPickFormulaReference('plain', 5)).toBe(false);
  });

  it('starts a grid pick only while an operand is expected', () => {
    expect(canStartFormulaReferencePick('=SUM(', 5, 5)).toBe(true);
    expect(canStartFormulaReferencePick('=A1+', 4, 4)).toBe(true);
    expect(canStartFormulaReferencePick('=IF(A1>0,', 9, 9)).toBe(true);
    expect(canStartFormulaReferencePick('=SUM(B1)', 8, 8)).toBe(false);
    expect(canStartFormulaReferencePick('=A1', 3, 3)).toBe(false);
    expect(canStartFormulaReferencePick('=SUM(B1)', 5, 7)).toBe(false);
    expect(canStartFormulaReferencePick('="hello', 7, 7)).toBe(false);
  });

  it('recognizes an unquoted or quoted qualifier before a picked reference', () => {
    expect(findTrailingSheetQualifierStart('=Sheet2!', 8)).toBe(1);
    expect(findTrailingSheetQualifierStart("=SUM('Sales Data'!", 18)).toBe(5);
    expect(findTrailingSheetQualifierStart('=A1+Sheet2!', 11)).toBe(4);
    expect(findTrailingSheetQualifierStart('=SUM(A1,', 8)).toBeNull();
  });
});
