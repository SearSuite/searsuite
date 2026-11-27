import { FormulaNodeKind, type FormulaAST, type IFormulaParser } from '@searsuite/sear-domain-formula-engine';

export function findNestedAggregateFormulaName(formula: string, parser: IFormulaParser): string | undefined {
  let ast: FormulaAST;
  try {
    ast = parser.parse(formula);
  } catch {
    return undefined;
  }

  const visit = (node: FormulaAST): string | undefined => {
    switch (node.kind) {
      case FormulaNodeKind.Call: {
        const name = node.name.toUpperCase();
        return name === 'SUBTOTAL' || name === 'AGGREGATE'
          ? name
          : node.args.map(visit).find((found) => found !== undefined);
      }
      case FormulaNodeKind.Invoke:
        return visit(node.callee) ?? node.args.map(visit).find((found) => found !== undefined);
      case FormulaNodeKind.Binary:
      case FormulaNodeKind.Intersection:
        return visit(node.left) ?? visit(node.right);
      case FormulaNodeKind.Unary:
        return visit(node.operand);
      case FormulaNodeKind.Tuple:
        return node.items.map(visit).find((found) => found !== undefined);
      case FormulaNodeKind.Array:
        return node.rows
          .flat()
          .map(visit)
          .find((found) => found !== undefined);
      default:
        return undefined;
    }
  };

  return visit(ast);
}
