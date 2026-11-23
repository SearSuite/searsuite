import { inspectExcelCellFormat } from '../src/formatCode/inspectExcelCellFormat';

describe('Excel CELL format information', () => {
  it.each([
    [undefined, 'G'],
    ['General', 'G'],
    ['0', 'F0'],
    ['0.00', 'F2'],
    ['#,##0.00', ',2'],
    ['0%', 'P0'],
    ['0.00%', 'P2'],
    ['$#,##0.00', 'C2'],
    ['0.00E+00', 'S2'],
    ['yyyy/mm/dd', 'D4'],
    ['hh:mm', 'D8'],
    ['hh:mm:ss', 'D9'],
    ['0"%"', 'F0'],
    ['0\\%', 'F0'],
  ])('classifies %s as %s', (code, expected) => {
    expect(inspectExcelCellFormat(code).format).toBe(expected);
  });

  it('reports color for negative numbers and parentheses for positive numbers', () => {
    expect(inspectExcelCellFormat('#,##0;[Red](#,##0)')).toEqual({
      format: ',0-', color: 1, parentheses: 0,
    });
    expect(inspectExcelCellFormat('(#,##0.0);(#,##0.0)')).toEqual({
      format: ',1()', color: 0, parentheses: 1,
    });
    expect(inspectExcelCellFormat('#,##0;(#,##0)')).toEqual({
      format: ',0', color: 0, parentheses: 0,
    });
  });
});
