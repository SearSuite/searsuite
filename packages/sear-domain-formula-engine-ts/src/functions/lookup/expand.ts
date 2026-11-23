import { FormulaErrorCode, createFormulaError, isFormulaError, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { MAX_FORMULA_ARRAY_CELLS } from '../shared/FormulaArrayLimit';
import { matrixArg, numberArg, scalar, lookupValueError } from './lookupHelpers';
/** EXPAND pads an array. Example: =EXPAND(A1:B2,3,3,0). */
export const EXPAND: FormulaFunction = {
  name: 'EXPAND',
  evaluate(args, context) {
    if (args.length < 2 || args.length > 4) return lookupValueError();
    const matrix = matrixArg(args[0], context);
    const rows = numberArg(args[1], context);
    const columns = args[2] && args[2].kind !== 'missing' ? numberArg(args[2], context) : undefined;
    const explicitFill = args[3] && args[3].kind !== 'missing';
    const fill = explicitFill ? scalar(args[3], context) : createFormulaError(FormulaErrorCode.NotAvailable);
    if (isFormulaError(matrix)) return matrix;
    if (isFormulaError(rows)) return rows;
    if (isFormulaError(columns)) return columns;
    const height = Math.trunc(rows);
    const width = columns === undefined ? matrix[0]?.length ?? 0 : Math.trunc(columns);
    if (
      !Array.isArray(matrix) ||
      height < matrix.length ||
      width < (matrix[0]?.length ?? 0)
    )
      return Array.isArray(matrix) ? lookupValueError() : matrix;
    if (height * width > MAX_FORMULA_ARRAY_CELLS)
      return createFormulaError(FormulaErrorCode.Number);
    if (height > 1_048_576 || width > 16_384) return lookupValueError();
    return Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => {
      if (r >= matrix.length || c >= matrix[r]!.length) return fill;
      const value = matrix[r]![c];
      return value === '' || isFormulaText(value) && value.value === '' ? null : value;
    }));
  },
};
