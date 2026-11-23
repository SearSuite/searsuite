import { reorderFormulaReferences } from '@searsuite/sear-domain-formula-engine';
import { MatrixOTActionName } from '@searsuite/sear-domain-ot';
import { FormulaParser, FormulaFormatter } from '../src';

describe('formula axis permutations', () => {
  const parser = new FormulaParser();
  const formatter = new FormulaFormatter();
  const changes = [
    { type: MatrixOTActionName.RowMove as const, fromIndex: 0, toIndex: 2 },
    { type: MatrixOTActionName.RowMove as const, fromIndex: 1, toIndex: 3 },
  ];
  it.each([
    ['=$A$1+A2', '=$A$3+A4'],
    ['=SUM(A1:A2)', '=SUM(A3:A4)'],
    ['=SUM(1:2)', '=SUM(3:4)'],
    ['=SUM(A:A)', '=SUM(A:A)'],
    ['=IF(A1>0,A2,99)', '=IF(A3>0,A4,99)'],
  ])('rewrites %s using the final permutation', (source, expected) => {
    expect(formatter.format(reorderFormulaReferences(parser.parse(source), changes))).toBe(expected);
  });
  it('rewrites only the requested qualified namespace and preserves unrelated AST identity', () => {
    const ast = parser.parse('=Inputs!$A$1+A1');
    const rewritten = reorderFormulaReferences(ast, changes, { sheetName: 'Inputs', includeUnqualified: false });
    expect(formatter.format(rewritten)).toBe('=Inputs!$A$3+A1');
    expect(reorderFormulaReferences(ast, changes, { sheetName: 'Other', includeUnqualified: false })).toBe(ast);
  });
});
