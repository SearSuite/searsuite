import {
  FormulaErrorCode,
  FormulaNodeKind,
  createFormulaError,
  isFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaAST,
  type FormulaError,
  type ResolvedFormulaRange,
} from '@searsuite/sear-domain-formula-engine';
import { isTruthy, resolveFormulaRange } from './helpers';
import { resolveIndirectReference, resolveOffsetReference } from '../lookup/dynamicReferenceResolution';

export function resolveConditionalReference(
  arg: FormulaArg | undefined,
  context: EvalContext,
): ResolvedFormulaRange | FormulaError | undefined {
  if (!arg || arg.kind === 'missing') return undefined;
  if (arg.kind === 'expression') return resolveAstReference(arg.ast, context);
  if (arg.kind === 'value' && arg.sourceAst) return resolveAstReference(arg.sourceAst, context);
  return resolveFormulaRange(arg, context);
}

export function resolveUnionReferenceAreas(
  arg: FormulaArg | undefined,
  context: EvalContext,
): ResolvedFormulaRange[] | FormulaError | undefined {
  const ast = arg?.kind === 'expression' ? arg.ast : arg?.kind === 'value' ? arg.sourceAst : undefined;
  if (ast?.kind !== FormulaNodeKind.Tuple) return undefined;
  const areas: ResolvedFormulaRange[] = [];
  for (const item of ast.items) {
    const area = resolveConditionalReference({ kind: 'expression', ast: item }, context);
    if (!area) return createFormulaError(FormulaErrorCode.Value);
    if (isFormulaError(area)) return area;
    areas.push(area);
  }
  return areas;
}

function resolveAstReference(
  ast: FormulaAST,
  context: EvalContext,
): ResolvedFormulaRange | FormulaError | undefined {
  switch (ast.kind) {
    case FormulaNodeKind.Cell:
    case FormulaNodeKind.Range:
    case FormulaNodeKind.WorkbookCell:
    case FormulaNodeKind.WorkbookRange:
    case FormulaNodeKind.ColumnRange:
    case FormulaNodeKind.RowRange:
      return resolveFormulaRange(ast, context);
    case FormulaNodeKind.Call: {
      if (ast.name.toUpperCase() === 'IF' && ast.args.length >= 2 && ast.args.length <= 3) {
        const condition = context.evaluateFormula?.(ast.args[0]!) ?? createFormulaError(FormulaErrorCode.Value);
        const selected = isTruthy(condition);
        if (isFormulaError(selected)) return selected;
        const branch = selected ? ast.args[1] : ast.args[2];
        return branch ? resolveAstReference(branch, context) : undefined;
      }
      const args: FormulaArg[] = ast.args.map((argument) =>
        argument.kind === FormulaNodeKind.Missing ? { kind: 'missing' } : { kind: 'expression', ast: argument });
      if (ast.name.toUpperCase() === 'INDIRECT') return resolveIndirectReference(args, context);
      if (ast.name.toUpperCase() === 'OFFSET') return resolveOffsetReference(args, context, resolveConditionalReference);
      return undefined;
    }
    default:
      return undefined;
  }
}
