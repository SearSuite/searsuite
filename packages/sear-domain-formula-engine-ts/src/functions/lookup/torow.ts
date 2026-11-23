import { isFormulaError, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { booleanArg, matrixArg, lookupValueError } from './lookupHelpers';
import { flattenVector, vectorIgnoreMode } from './vectorFlatten';
/** TOROW flattens an array into one row. Example: =TOROW(A1:B2). */
export const TOROW: FormulaFunction = {
  name: 'TOROW',
  evaluate(args, context) {
    if (args.length < 1 || args.length > 3) return lookupValueError();
    const ignore = vectorIgnoreMode(args[1], context);
    if (isFormulaError(ignore)) return ignore;
    const scanByColumn = booleanArg(args[2], context);
    if (isFormulaError(scanByColumn)) return scanByColumn;
    const matrix = matrixArg(args[0], context, Boolean(ignore & 2));
    if (!Array.isArray(matrix)) return matrix;
    const values = flattenVector(matrix, ignore, scanByColumn);
    return [values];
  },
};
