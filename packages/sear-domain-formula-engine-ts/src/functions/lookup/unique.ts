import { FormulaErrorCode, createFormulaError, isFormulaError, type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { matrixArg, booleanArg, lookupValueError, equalsValue, sameLookupType } from './lookupHelpers';
/** UNIQUE returns distinct rows. Example: =UNIQUE({1;1;2}) returns 1 and 2. */
export const UNIQUE: FormulaFunction = {
  name: 'UNIQUE',
  evaluate(args, context) {
    if (args.length < 1 || args.length > 3) return lookupValueError();
    const matrix = matrixArg(args[0], context, true);
    if (!Array.isArray(matrix)) return matrix;
    const byColumn = booleanArg(args[1], context);
    const exactlyOnce = booleanArg(args[2], context);
    if (isFormulaError(byColumn)) return byColumn;
    if (isFormulaError(exactlyOnce)) return exactlyOnce;
    const vectors = byColumn
      ? matrix[0]!.map((_, index) => matrix.map((row) => row[index]!))
      : matrix;
    const sameVector = (left: FormulaValue[], right: FormulaValue[]) =>
      left.length === right.length && left.every((value, index) =>
        isFormulaError(value) && isFormulaError(right[index])
          ? value.code === right[index].code
          : sameLookupType(value, right[index]!) && equalsValue(value, right[index]!));
    const selected = vectors.filter((vector, index) => exactlyOnce
      ? vectors.filter((other) => sameVector(vector, other)).length === 1
      : vectors.findIndex((other) => sameVector(vector, other)) === index);
    if (selected.length === 0) return createFormulaError(FormulaErrorCode.Calculation);
    const output = byColumn
      ? matrix.map((_, row) => selected.map((vector) => vector[row]!))
      : selected;
    return output.map((row) => row.map((value) => value === null ? '' : value));
  },
};
