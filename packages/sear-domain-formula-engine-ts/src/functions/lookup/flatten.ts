import { type FormulaFunction, isFormulaError } from '@searsuite/sear-domain-formula-engine';
import { flatten, matrixArg, lookupValueError } from './lookupHelpers';

/** FLATTEN combines one or more arrays into a single column. Example: =FLATTEN(A1:B2,C1:C2). */
export const FLATTEN: FormulaFunction = {
  name: 'FLATTEN',
  evaluate(args, context) {
    if (args.length < 1) return lookupValueError();
    const output = [];
    for (const arg of args) {
      const matrix = matrixArg(arg, context);
      if (isFormulaError(matrix)) return matrix;
      output.push(...flatten(matrix).map((value) => [value]));
    }
    return output;
  },
};
