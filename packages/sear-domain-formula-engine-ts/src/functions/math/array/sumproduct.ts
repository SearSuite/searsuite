/**
 * SUMPRODUCT: Multiplies corresponding array elements and adds the products.
 * Example: =SUMPRODUCT({2,3,4},{10,20,30}) returns 200.
 */
import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import {
  isFormulaErrorValue,
  matrixDimensions,
  matrixFromArg,
  matrixNumbers,
  numberError,
  valueError,
} from '../shared/mathUtils';

export const SUMPRODUCT: FormulaFunction = {
  name: 'SUMPRODUCT',
  evaluate(args, context): FormulaValue {
    if (args.length < 1) return valueError();

    const matrices: number[][][] = [];
    for (const arg of args) {
      const matrix = matrixFromArg(arg, context);
      if (isFormulaErrorValue(matrix)) return matrix;
      const numbers = matrixNumbers(matrix, true);
      if (isFormulaErrorValue(numbers)) return numbers;
      matrices.push(numbers);
    }

    const dimensions = matrixDimensions(matrices[0]!.map((row) => row.slice()));
    if (isFormulaErrorValue(dimensions)) return dimensions;
    if (
      matrices.some((matrix) => matrix.length !== dimensions[0] || matrix.some((row) => row.length !== dimensions[1]))
    ) {
      return valueError();
    }

    let total = 0;
    for (let row = 0; row < dimensions[0]; row++) {
      for (let column = 0; column < dimensions[1]; column++) {
        let product = 1;
        for (const matrix of matrices) product *= matrix[row]![column]!;
        total += product;
      }
    }
    return Number.isFinite(total) ? total : numberError();
  },
};
