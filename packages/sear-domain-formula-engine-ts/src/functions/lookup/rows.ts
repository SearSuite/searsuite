import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaArgumentKind, isFormulaError } from '@searsuite/sear-domain-formula-engine';
import { dimensions, matrixArg, rangeArg, rangeDimensions, lookupValueError } from './lookupHelpers';
import { resolveConditionalReference } from '../shared/conditionalReference';
/** ROWS returns the number of rows in a reference. Example: =ROWS(A1:C2) returns 2. */
export const ROWS: FormulaFunction = {
  name: 'ROWS',
  evaluate(args, context) {
    if (args.length !== 1) return lookupValueError();
    if (isFormulaArgumentKind(args[0], 'value') || isFormulaArgumentKind(args[0], 'expression')) {
      const reference = resolveConditionalReference(args[0], context);
      if (reference) return isFormulaError(reference) ? reference : rangeDimensions(reference).rows;
      const matrix = matrixArg(args[0], context);
      return Array.isArray(matrix) ? dimensions(matrix).rows : matrix;
    }
    const range = rangeArg(args[0], context);
    return 'kind' in range ? range : rangeDimensions(range).rows;
  },
};
