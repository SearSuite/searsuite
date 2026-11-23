/**
 * MINVERSE: Returns the inverse matrix for a square, nonsingular matrix.
 * Example: =MINVERSE({1,2;3,4}) returns {-2,1;1.5,-0.5}.
 */
import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, matrixDimensions, matrixFromArg, matrixNumbers, valueError } from '../shared/mathUtils';
import { inverseMatrix } from './arrayUtils';

export const MINVERSE: FormulaFunction = {
  name: 'MINVERSE',
  evaluate(args, context): FormulaValue {
    if (args.length !== 1) return valueError();
    const matrix = matrixFromArg(args[0]!, context, { rejectBlankCells: true });
    if (isFormulaErrorValue(matrix)) return matrix;
    const numbers = matrixNumbers(matrix);
    if (isFormulaErrorValue(numbers)) return numbers;
    const dimensions = matrixDimensions(matrix);
    if (isFormulaErrorValue(dimensions) || dimensions[0] !== dimensions[1]) return valueError();
    return inverseMatrix(numbers);
  },
};
