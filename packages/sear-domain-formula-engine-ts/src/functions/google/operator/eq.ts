import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { binaryValues, comparable } from '../runtime/googleRuntime';
/** EQ tests two values for equality. Example: =EQ(2,2) returns TRUE. */
export const EQ: FormulaFunction = {
  name: 'EQ',
  evaluate: (args, context) => binaryValues(args, context, (a, b) => comparable(a) === comparable(b)),
};
