/**
 * RAND: Returns a random decimal number greater than or equal to 0 and less than 1.
 * Example: =RAND() returns a value in the range [0,1).
 */
import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { valueError } from '../shared/mathUtils';
import { randomValue } from './randomUtils';

export const RAND: FormulaFunction = {
  name: 'RAND',
  volatile: true,
  evaluate(args, context): FormulaValue {
    return args.length === 0 ? randomValue(context) : valueError();
  },
};
