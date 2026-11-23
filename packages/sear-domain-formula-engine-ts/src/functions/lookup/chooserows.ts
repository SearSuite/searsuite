import { isFormulaError, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { matrixArg, lookupValueError, selectionIndexes } from './lookupHelpers';
/** CHOOSEROWS selects rows from an array. Example: =CHOOSEROWS(A1:C3,1,3). */
export const CHOOSEROWS: FormulaFunction = {
  name: 'CHOOSEROWS',
  evaluate(args, context) {
    if (args.length < 2) return lookupValueError();
    const matrix = matrixArg(args[0], context, true);
    if (!Array.isArray(matrix)) return matrix;
    const output = selectionIndexes(args.slice(1), context, matrix.length);
    if (isFormulaError(output)) return output;
    return output.map((row) => matrix[row]!);
  },
};
