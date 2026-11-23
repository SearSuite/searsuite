import { type FormulaAST } from './FormulaAST';
import { FormulaNodeKind } from './FormulaNodeKind';
import { type FormulaReferenceNode } from './FormulaReferenceNode';

/** Traverses expression containers while preserving unchanged node identities. */
export function mapFormulaReferenceNodes(ast: FormulaAST, map: (node: FormulaReferenceNode) => FormulaAST): FormulaAST {
  const rewrite = (node: FormulaAST) => mapFormulaReferenceNodes(node, map);
  switch (ast.kind) {
    case FormulaNodeKind.Cell:
    case FormulaNodeKind.Range:
    case FormulaNodeKind.WorkbookCell:
    case FormulaNodeKind.WorkbookRange:
    case FormulaNodeKind.RowRange:
    case FormulaNodeKind.ColumnRange:
      return map(ast);
    case FormulaNodeKind.Binary:
    case FormulaNodeKind.Intersection: {
      const left = rewrite(ast.left);
      const right = rewrite(ast.right);
      return left === ast.left && right === ast.right ? ast : { ...ast, left, right };
    }
    case FormulaNodeKind.Unary: {
      const operand = rewrite(ast.operand);
      return operand === ast.operand ? ast : { ...ast, operand };
    }
    case FormulaNodeKind.Call: {
      const args = ast.args.map(rewrite);
      return args.every((node, index) => node === ast.args[index]) ? ast : { ...ast, args };
    }
    case FormulaNodeKind.Invoke: {
      const callee = rewrite(ast.callee);
      const args = ast.args.map(rewrite);
      return callee === ast.callee && args.every((node, index) => node === ast.args[index])
        ? ast
        : { ...ast, callee, args };
    }
    case FormulaNodeKind.Tuple: {
      const items = ast.items.map(rewrite);
      return items.every((node, index) => node === ast.items[index]) ? ast : { ...ast, items };
    }
    case FormulaNodeKind.Array: {
      const rows = ast.rows.map((row) => row.map(rewrite));
      return rows.every((row, r) => row.every((node, c) => node === ast.rows[r][c])) ? ast : { ...ast, rows };
    }
    default:
      return ast;
  }
}
