import { isFormulaError, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { booleanArg, matrixArg, lookupValueError } from './lookupHelpers';
import { flattenVector, vectorIgnoreMode } from './vectorFlatten';
/** TOCOL flattens an array into one column. Example: =TOCOL(A1:B2). */
export const TOCOL: FormulaFunction = {
  name: 'TOCOL',
  evaluate(args, context) {
    if (args.length < 1 || args.length > 3) return lookupValueError();
    const ignore = vectorIgnoreMode(args[1], context);
    if (isFormulaError(ignore)) return ignore;
    const scanByColumn = booleanArg(args[2], context);
    if (isFormulaError(scanByColumn)) return scanByColumn;
    const matrix = matrixArg(args[0], context, Boolean(ignore & 2));
    if (!Array.isArray(matrix)) return matrix;
    const values = flattenVector(matrix, ignore, scanByColumn);
    return values.map((value) => [value]);
  },
};
