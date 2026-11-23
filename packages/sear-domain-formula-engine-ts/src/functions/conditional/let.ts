/**
 * LET: Evaluates sequential name/value bindings in a child lexical scope.
 * Example: =LET(rate,2,amount,5,rate*amount) returns 10.
 */
import {
  isFormulaArgumentKind,
  type EvalContext,
  type FormulaAST,
  type FormulaArg,
  FormulaErrorCode,
  type FormulaFunction,
  FormulaNodeKind,
  type FormulaValue,
  createFormulaError,
} from '@searsuite/sear-domain-formula-engine';
import { FormulaLexicalScope } from '../../FormulaLexicalScope';

const MAX_LET_ARGUMENTS = 253;

export const LET: FormulaFunction = {
  name: 'LET',
  lazy: true,
  evaluate(args: FormulaArg[], context: EvalContext): FormulaValue {
    if (args.length < 3 || args.length > MAX_LET_ARGUMENTS || args.length % 2 === 0)
      return createFormulaError(FormulaErrorCode.Value);
    const asts = args.map(expressionOf);
    if (asts.some((ast) => ast === undefined)) return createFormulaError(FormulaErrorCode.Value);
    const expressions = asts as FormulaAST[];
    const scope = new FormulaLexicalScope(context.scope);
    for (let index = 0; index < expressions.length - 1; index += 2) {
      const name = expressions[index];
      if (name.kind !== FormulaNodeKind.Name || /^[rc]$/i.test(name.name))
        return createFormulaError(FormulaErrorCode.Value);
      const value = context.evaluateFormula?.(expressions[index + 1], scope);
      if (value === undefined) return createFormulaError(FormulaErrorCode.Value);
      scope.set(name.name, value);
    }
    return (
      context.evaluateFormula?.(expressions[expressions.length - 1], scope) ??
      createFormulaError(FormulaErrorCode.Value)
    );
  },
};

function expressionOf(arg: FormulaArg): FormulaAST | undefined {
  return isFormulaArgumentKind(arg, 'expression') ? arg.ast : undefined;
}
