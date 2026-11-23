import { type FormulaFunction, isFormulaError } from '@searsuite/sear-domain-formula-engine';
import { matrixArg, numberArg, lookupValueError } from './lookupHelpers';

/** ARRAY_CONSTRAIN limits an array to a row and column count. Example: =ARRAY_CONSTRAIN(A1:C3,2,1). */
export const ARRAY_CONSTRAIN: FormulaFunction = {
  name: 'ARRAY_CONSTRAIN',
  evaluate(args, context) {
    if (args.length !== 3) return lookupValueError();
    const matrix = matrixArg(args[0], context, true);
    const rows = numberArg(args[1], context);
    const columns = numberArg(args[2], context);
    if (isFormulaError(matrix)) return matrix;
    if (isFormulaError(rows)) return rows;
    if (isFormulaError(columns)) return columns;
    if (
      !Number.isInteger(rows) ||
      !Number.isInteger(columns) ||
      rows < 1 ||
      columns < 1
    )
      return lookupValueError();
    return matrix.slice(0, rows).map((row) => row.slice(0, columns));
  },
};
