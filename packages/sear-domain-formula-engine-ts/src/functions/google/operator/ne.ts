import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { binaryValues, comparable } from '../runtime/googleRuntime';
/** NE tests two values for inequality. Example: =NE(2,3) returns TRUE. */
export const NE: FormulaFunction = {
  name: 'NE',
  evaluate: (args, context) => binaryValues(args, context, (a, b) => comparable(a) !== comparable(b)),
};
