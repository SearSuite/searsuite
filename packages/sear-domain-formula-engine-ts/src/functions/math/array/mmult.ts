/**
 * MMULT: Returns the matrix product of two compatible arrays.
 * Example: =MMULT({1,2},{3;4}) returns 11.
 */
import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, matrixDimensions, matrixFromArg, matrixNumbers, numberError, valueError } from '../shared/mathUtils';
import { finiteSumProducts } from '../shared/numberUtils';

export const MMULT: FormulaFunction = {
  name: 'MMULT',
  evaluate(args, context): FormulaValue {
    if (args.length !== 2) return valueError();
    const left = matrixFromArg(args[0]!, context, { rejectBlankCells: true });
    if (isFormulaErrorValue(left)) return left;
    const right = matrixFromArg(args[1]!, context, { rejectBlankCells: true });
    if (isFormulaErrorValue(right)) return right;

    const leftDimensions = matrixDimensions(left);
    const rightDimensions = matrixDimensions(right);
    if (isFormulaErrorValue(leftDimensions) || isFormulaErrorValue(rightDimensions)) return valueError();

    const leftNumbers = matrixNumbers(left);
    if (isFormulaErrorValue(leftNumbers)) return leftNumbers;
    const rightNumbers = matrixNumbers(right);
    if (isFormulaErrorValue(rightNumbers)) return rightNumbers;
    if (leftDimensions[1] !== rightDimensions[0]) return valueError();

    const result: number[][] = [];
    for (let row = 0; row < leftDimensions[0]; row++) {
      const outputRow: number[] = [];
      for (let column = 0; column < rightDimensions[1]; column++) {
        const terms: number[][] = [];
        for (let index = 0; index < leftDimensions[1]; index++) {
          terms.push([leftNumbers[row]![index]!, rightNumbers[index]![column]!]);
        }
        const value = finiteSumProducts(terms);
        if (!Number.isFinite(value)) return numberError();
        outputRow.push(value);
      }
      result.push(outputRow);
    }
    return result.length === 1 && result[0]?.length === 1 ? result[0][0]! : result;
  },
};
