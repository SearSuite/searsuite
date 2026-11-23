import { FormulaErrorCode, createFormulaError, isFormulaError, type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { matrixArg, lookupValueError } from './lookupHelpers';
/** FILTER returns rows matching a Boolean include array. Example: =FILTER(A1:B3,{TRUE;FALSE;TRUE}). */
export const FILTER: FormulaFunction = {
  name: 'FILTER',
  evaluate(args, context) {
    if (args.length < 2 || args.length > 3) return lookupValueError();
    const matrix = matrixArg(args[0], context, true);
    const include = matrixArg(args[1], context, true);
    if (!Array.isArray(include)) return include;
    if (!Array.isArray(matrix)) return matrix;
    const includeRows = include.length;
    const includeColumns = include[0]?.length ?? 0;
    const rows = matrix.length;
    const columns = matrix[0]?.length ?? 0;
    const scalarInclude = includeRows === 1 && includeColumns === 1 ? include[0]?.[0] : undefined;
    if (isFormulaError(scalarInclude)) return scalarInclude;
    const scalarBroadcast = includeRows === 1 && includeColumns === 1 && (rows !== 1 || columns !== 1);
    if (!scalarBroadcast && !(includeRows === rows && includeColumns === 1) && !(includeRows === 1 && includeColumns === columns))
      return lookupValueError();
    for (const row of include) {
      for (const value of row) {
        if (isFormulaError(value)) return value;
        if (typeof value !== 'boolean' && typeof value !== 'number' && value !== null) return lookupValueError();
      }
    }
    let result: FormulaValue[][];
    if (scalarBroadcast) {
      if (!scalarInclude) return lookupValueError();
      result = matrix;
    } else if (includeRows === rows && includeColumns === 1) {
      result = matrix.filter((_, index) => Boolean(include[index]?.[0]));
    } else if (includeRows === 1 && includeColumns === columns) {
      const selected = include[0]!.map(Boolean);
      result = matrix.map((row) => row.filter((_, index) => selected[index]));
      if (result[0]?.length === 0) result = [];
    } else {
      return lookupValueError();
    }
    for (const row of result) {
      for (const value of row) if (isFormulaError(value)) return value;
    }
    if (result.length > 0) return result;
    if (!args[2]) return createFormulaError(FormulaErrorCode.Calculation);
    const fallback = matrixArg(args[2], context, true);
    if (!Array.isArray(fallback)) return fallback;
    return fallback.length === 1 && fallback[0]?.length === 1 ? fallback[0][0] : fallback;
  },
};
