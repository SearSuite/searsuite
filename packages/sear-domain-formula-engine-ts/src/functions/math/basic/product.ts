/**
 * PRODUCT: Multiplies all numeric values in the supplied arguments.
 * Example: =PRODUCT(1,2,3) returns 6.
 */
import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { collectNumbers, isFormulaErrorValue, numberError, valueError } from '../shared/mathUtils';

export const PRODUCT: FormulaFunction = {
  name: 'PRODUCT',
  evaluate(args, context): FormulaValue {
    if (args.length === 0) return valueError();
    const values = collectNumbers(args, context, { referenceNumericOnly: true });
    if (isFormulaErrorValue(values)) return values;
    if (values.length === 0) return 0;
    if (values.includes(0)) return 0;
    let direct = 1;
    let finiteDirect = true;
    let mantissa = 1;
    let exponent = 0;
    for (const value of values) {
      if (finiteDirect) {
        direct *= value;
        finiteDirect = Number.isFinite(direct) && direct !== 0;
      }
      const [coefficient, power] = value.toExponential().split('e');
      mantissa *= Number(coefficient);
      exponent += Number(power);
      if (Math.abs(mantissa) >= 10) {
        mantissa /= 10;
        exponent++;
      } else if (Math.abs(mantissa) < 1) {
        mantissa *= 10;
        exponent--;
      }
    }
    if (finiteDirect && Number.isSafeInteger(direct)) return direct;
    const result = Number(`${mantissa}e${exponent}`);
    return Number.isFinite(result) ? result : numberError();
  },
};
