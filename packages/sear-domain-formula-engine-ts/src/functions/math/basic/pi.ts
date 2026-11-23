/**
 * PI: Returns the mathematical constant pi.
 * Example: =PI()*0 returns 0.
 */
import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { valueError } from '../shared/mathUtils';

export const PI: FormulaFunction = {
  name: 'PI',
  evaluate(args): FormulaValue {
    return args.length === 0 ? Math.PI : valueError();
  },
};
