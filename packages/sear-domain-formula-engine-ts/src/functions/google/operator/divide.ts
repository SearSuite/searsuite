import { FormulaErrorCode, createFormulaError, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { binaryNumber } from '../runtime/googleRuntime';
/** DIVIDE divides one value by another. Example: =DIVIDE(6,2) returns 3. */
export const DIVIDE: FormulaFunction = {
  name: 'DIVIDE',
  evaluate: (args, context) =>
    binaryNumber(args, context, (a, b) => (b === 0 ? createFormulaError(FormulaErrorCode.DivisionByZero) : a / b)),
};
