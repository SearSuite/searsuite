import {
  FormulaNodeKind,
  type EvalContext,
  type FormulaArg,
  type FormulaAST,
} from '@searsuite/sear-domain-formula-engine';

/** Preserves empty-cell provenance when a scalar reference evaluates to zero. */
export function isBlankScalarInput(arg: FormulaArg, context: EvalContext): boolean {
  if (arg.kind === FormulaNodeKind.Cell) return isEmptyCell(arg.row, arg.col, context);
  if (arg.kind === 'expression') return isBlankSource(arg.ast, context);
  return arg.kind === 'value' && arg.sourceAst !== undefined && isBlankSource(arg.sourceAst, context);
}

function isBlankSource(ast: FormulaAST, context: EvalContext): boolean {
  if (ast.kind === FormulaNodeKind.Cell) return isEmptyCell(ast.row, ast.col, context);
  if (ast.kind !== FormulaNodeKind.Call || ast.name.toUpperCase() !== 'IF') return false;
  const condition = ast.args[0];
  if (condition?.kind !== FormulaNodeKind.Boolean) return false;
  const selected = ast.args[condition.value ? 1 : 2];
  return selected !== undefined && isBlankSource(selected, context);
}

function isEmptyCell(row: number, col: number, context: EvalContext): boolean {
  const cells = context.iterateRangeCells?.(row, col, row, col);
  if (!cells) return false;
  for (const cell of cells) return cell.source === 'empty';
  return false;
}
