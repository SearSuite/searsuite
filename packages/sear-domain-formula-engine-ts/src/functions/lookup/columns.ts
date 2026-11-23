import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaArgumentKind, isFormulaError } from '@searsuite/sear-domain-formula-engine';
import { dimensions, matrixArg, rangeArg, rangeDimensions, lookupValueError } from './lookupHelpers';
import { resolveConditionalReference } from '../shared/conditionalReference';
/** COLUMNS returns the number of columns in a reference. Example: =COLUMNS(A1:C2) returns 3. */
export const COLUMNS: FormulaFunction = {
  name: 'COLUMNS',
  evaluate(args, context) {
    if (args.length !== 1) return lookupValueError();
    if (isFormulaArgumentKind(args[0], 'value') || isFormulaArgumentKind(args[0], 'expression')) {
      const reference = resolveConditionalReference(args[0], context);
      if (reference) return isFormulaError(reference) ? reference : rangeDimensions(reference).columns;
      const matrix = matrixArg(args[0], context);
      return Array.isArray(matrix) ? dimensions(matrix).columns : matrix;
    }
    const range = rangeArg(args[0], context);
    return 'kind' in range ? range : rangeDimensions(range).columns;
  },
};
