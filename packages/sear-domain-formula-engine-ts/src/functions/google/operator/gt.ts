import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { binaryValues, comparable } from '../runtime/googleRuntime';
/** GT tests whether the first value is greater. Example: =GT(3,2) returns TRUE. */
export const GT: FormulaFunction = {
  name: 'GT',
  evaluate: (args, context) => binaryValues(args, context, (a, b) => comparable(a) > comparable(b)),
};
