import { isFormulaError, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { matrixArg, lookupValueError, dimensions, selectionIndexes } from './lookupHelpers';
/** CHOOSECOLS selects columns from an array. Example: =CHOOSECOLS(A1:C2,1,3). */
export const CHOOSECOLS: FormulaFunction = {
  name: 'CHOOSECOLS',
  evaluate(args, context) {
    if (args.length < 2) return lookupValueError();
    const matrix = matrixArg(args[0], context, true);
    if (!Array.isArray(matrix)) return matrix;
    const { columns } = dimensions(matrix);
    const output = selectionIndexes(args.slice(1), context, columns);
    if (isFormulaError(output)) return output;
    return matrix.map((row) => output.map((column) => row[column]));
  },
};
