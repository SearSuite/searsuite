import { FormulaFormatter, FormulaParser } from '../src';

describe('FormulaFormatter', () => {
  const parser = new FormulaParser();
  const formatter = new FormulaFormatter();

  it('round-trips strings containing double quotes', () => {
    const formula = '="a""b"';

    expect(formatter.format(parser.parse(formula))).toBe(formula);
  });

  it('preserves an over-limit numeric literal when formatting a formula', () => {
    const formula = '=BASE(9007199254740992,2)';
    expect(formatter.format(parser.parse(formula))).toBe(formula);
  });

  it('round-trips direct and chained expression invocations', () => {
    const formula = '=F(X,F(Y,X+Y))(1)(2)';

    expect(formatter.format(parser.parse(formula))).toBe(formula);
  });

  it('round-trips reference intersections', () => {
    const formula = '=SUM(A1:B3 B2:C4)';
    expect(formatter.format(parser.parse(formula))).toBe(formula);
  });

  it('formats workbook references with current sheet names', () => {
    const ast = parser.parse("=SUM('Sales Data'!$A$1:B5)+Sheet2!C3");

    expect(
      formatter.format(ast, {
        resolveSheetName: (sheetName) => (sheetName === 'Sales Data' ? 'Revenue 2026' : sheetName),
      }),
    ).toBe("=SUM('Revenue 2026'!$A$1:B5)+Sheet2!C3");
  });

  it('formats missing workbook sheet bindings as broken references', () => {
    const ast = parser.parse('=Sheet2!A1');

    expect(
      formatter.format(ast, {
        missingSheetName: '#REF',
        resolveSheetName: () => undefined,
      }),
    ).toBe('=#REF!A1');
  });

  it('formats deleted coordinates as broken references', () => {
    expect(formatter.format({ kind: 'cell', row: -1, col: -1, absRow: false, absCol: false })).toBe('=#REF!');
    expect(
      formatter.format({
        kind: 'workbookRange',
        sheetName: 'Sheet2',
        start: [-1, -1],
        end: [-1, -1],
        absStartRow: false,
        absStartCol: false,
        absEndRow: false,
        absEndCol: false,
      }),
    ).toBe('=#REF!');
  });
});
