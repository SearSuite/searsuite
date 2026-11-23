import {
  FormulaNodeKind,
  type EvalContext,
  type FormulaArg,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { FormulaLexicalScope } from '../../FormulaLexicalScope';
import { lookupValueError } from './lookupHelpers';

const AGGREGATIONS = new Set([
  'SUM', 'AVERAGE', 'COUNT', 'COUNTA', 'MAX', 'MIN', 'PRODUCT',
  'MEDIAN', 'STDEV.S', 'STDEV.P', 'VAR.S', 'VAR.P',
]);

type Aggregation = (values: FormulaValue[]) => FormulaValue;

export function groupAggregation(arg: FormulaArg | undefined, context: EvalContext): Aggregation | undefined {
  if (!arg || arg.kind !== 'value' || !arg.sourceAst || !context.evaluateFormula) return undefined;
  const ast = arg.sourceAst;
  if (ast.kind === FormulaNodeKind.Name && AGGREGATIONS.has(ast.name.toUpperCase())) {
    return (values) => {
      const scope = new FormulaLexicalScope(context.scope);
      scope.set('SEAR_GROUP_VALUES', values);
      return context.evaluateFormula!({
        kind: FormulaNodeKind.Call,
        name: ast.name,
        args: [{ kind: FormulaNodeKind.Name, name: 'SEAR_GROUP_VALUES' }],
      }, scope);
    };
  }
  if (ast.kind !== FormulaNodeKind.Call || ast.name.toUpperCase() !== 'LAMBDA' || ast.args.length !== 2) {
    return undefined;
  }
  const [parameter, body] = ast.args;
  if (parameter?.kind !== FormulaNodeKind.Name || !body) return undefined;
  return (values) => {
    const scope = new FormulaLexicalScope(context.scope);
    scope.set(parameter.name, values);
    const result = context.evaluateFormula!(body, scope);
    return Array.isArray(result) ? lookupValueError() : result;
  };
}
