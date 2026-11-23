import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { matrixArg, rangeArg, transpose, lookupValueError } from './lookupHelpers';
import { FormulaNodeKind, isFormulaError } from '@searsuite/sear-domain-formula-engine';
/** TRANSPOSE swaps array rows and columns. Example: =TRANSPOSE(A1:B2). */
export const TRANSPOSE: FormulaFunction = {
  name: 'TRANSPOSE',
  evaluate(args, context) {
    if (args.length !== 1) return lookupValueError();
    if (context.arrayFormulaMode === 'legacy' && args[0] &&
      (args[0].kind === FormulaNodeKind.Range || args[0].kind === FormulaNodeKind.WorkbookRange)) {
      const range = rangeArg(args[0], context);
      if (!isFormulaError(range) && (range.endRow > range.startRow || range.endCol > range.startCol)) {
        return lookupValueError();
      }
    }
    const matrix = matrixArg(args[0], context, true);
    if (!Array.isArray(matrix)) return matrix;
    if (matrix.length === 1 && matrix[0]?.length === 1 && isFormulaError(matrix[0][0])) return matrix[0][0];
    return transpose(matrix);
  },
};
