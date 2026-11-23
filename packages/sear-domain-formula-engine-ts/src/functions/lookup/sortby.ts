import { isFormulaError, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { matrixArg, numberArg, compareSortValues, lookupValueError } from './lookupHelpers';
/** SORTBY orders rows using one or more key arrays. Example: =SORTBY(A1:B3,B1:B3,1). */
export const SORTBY: FormulaFunction = {
  name: 'SORTBY',
  evaluate(args, context) {
    if (args.length < 2) return lookupValueError();
    const sortArgs = args.length % 2 === 0 ? [...args, { kind: 'value' as const, value: 1 }] : args;
    const matrix = matrixArg(sortArgs[0], context, true);
    if (!Array.isArray(matrix)) return matrix;
    const scalarError = matrix.length === 1 && matrix[0]?.length === 1 ? matrix[0][0] : undefined;
    if (isFormulaError(scalarError)) return scalarError;
    const firstKey = matrixArg(sortArgs[1], context);
    if (!Array.isArray(firstKey)) return firstKey;
    const width = matrix[0]?.length ?? 0;
    const horizontal = width > 1 && firstKey.length === 1 && firstKey[0]?.length === width;
    if (horizontal && matrix.some((row) => row.length !== width)) return lookupValueError();
    const indexes = Array.from({ length: horizontal ? width : matrix.length }, (_, index) => index);
    for (let p = sortArgs.length - 2; p >= 1; p -= 2) {
      const key = p === 1 ? firstKey : matrixArg(sortArgs[p], context);
      const order = numberArg(sortArgs[p + 1], context);
      if (!Array.isArray(key)) return key;
      if (isFormulaError(order)) return order;
      const direction = Math.floor(order);
      if (![1, -1].includes(direction)) return lookupValueError();
      const scalarKey = key.length === 1 && key[0]?.length === 1;
      if (horizontal) {
        if (!scalarKey && (key.length !== 1 || key[0]?.length !== width)) return lookupValueError();
        indexes.sort((a, b) => scalarKey ? 0 : compareSortValues(key[0]![a]!, key[0]![b]!) * direction);
      } else {
        if (!scalarKey && (key.length !== matrix.length || key.some((row) => row.length !== 1))) return lookupValueError();
        indexes.sort((a, b) => scalarKey ? 0 : compareSortValues(key[a]![0]!, key[b]![0]!) * direction);
      }
    }
    return horizontal ? matrix.map((row) => indexes.map((index) => row[index]!)) : indexes.map((index) => matrix[index]!);
  },
};
