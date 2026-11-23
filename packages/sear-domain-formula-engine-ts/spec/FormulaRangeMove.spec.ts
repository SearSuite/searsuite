import { moveFormulaReferences } from '@searsuite/sear-domain-formula-engine';
import { FormulaParser, FormulaFormatter } from '../src';

describe('formula range moves', () => {
  const parser = new FormulaParser();
  const formatter = new FormulaFormatter();
  const move = { start: [0, 0], end: [1, 1], rowOffset: 3, columnOffset: 2 } as const;
  it('follows moved references even when absolute, preserving unrelated references', () => {
    expect(formatter.format(moveFormulaReferences(parser.parse('=$A$1+A1+C3+SUM(A1:B2)'), move))).toBe(
      '=$C$4+C4+C3+SUM(C4:D5)',
    );
  });
  it('keeps partial ranges and other sheets unchanged', () => {
    const ast = parser.parse('=SUM(A1:C3)+Other!A1');
    expect(moveFormulaReferences(ast, move)).toBe(ast);
    expect(
      formatter.format(moveFormulaReferences(parser.parse('=Here!A1+Other!A1'), { ...move, sheetName: 'Here' })),
    ).toBe('=Here!C4+Other!A1');
  });
  it('visits tuples, arrays and unary expressions', () => {
    expect(formatter.format(moveFormulaReferences(parser.parse('=SUM(-A1,{A1,B2})'), move))).toBe('=SUM(-C4,{C4,D5})');
  });
});
