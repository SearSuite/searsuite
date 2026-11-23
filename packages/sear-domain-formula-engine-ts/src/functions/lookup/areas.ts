import { FormulaNodeKind, isFormulaArgumentKind, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { lookupValueError } from './lookupHelpers';
import { resolveConditionalReference } from '../shared/conditionalReference';
import { resolveReferenceIntersection } from '../../FormulaReferenceIntersection';
import { isFormulaError } from '@searsuite/sear-domain-formula-engine';

/** AREAS counts areas in a reference. Example: =AREAS(A1:B2) returns 1. */
export const AREAS: FormulaFunction = {
  name: 'AREAS',
  lazy: true,
  evaluate(args, context) {
    if (args.length !== 1) return lookupValueError();
    if (isFormulaArgumentKind(args[0], 'expression')) {
      const ast = args[0].ast;
      if (ast.kind === FormulaNodeKind.Tuple) return ast.items.length;
      if (ast.kind === FormulaNodeKind.Intersection) {
        const reference = resolveReferenceIntersection(ast, context);
        return isFormulaError(reference) ? reference : 1;
      }
      if (
        ast.kind === FormulaNodeKind.Cell ||
        ast.kind === FormulaNodeKind.Range ||
        ast.kind === FormulaNodeKind.WorkbookCell ||
        ast.kind === FormulaNodeKind.WorkbookRange ||
        ast.kind === FormulaNodeKind.ColumnRange ||
        ast.kind === FormulaNodeKind.RowRange
      ) return 1;
    }
    const range = resolveConditionalReference(args[0], context);
    return !range ? lookupValueError() : isFormulaError(range) ? range : 1;
  },
};
