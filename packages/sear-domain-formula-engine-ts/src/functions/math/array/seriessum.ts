/**
 * SERIESSUM: Evaluates a power series from an initial value, step, and coefficients.
 * Example: =SERIESSUM(2,0,1,{1,2,3}) returns 17.
 */
import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { collectNumbers, isFormulaErrorValue, numberError, readScalar, valueError } from '../shared/mathUtils';

export const SERIESSUM: FormulaFunction = {
  name: 'SERIESSUM',
  evaluate(args, context): FormulaValue {
    if (args.length !== 4) return valueError();
    const x = readScalar(args, 0, context);
    if (isFormulaErrorValue(x)) return x;
    const n = readScalar(args, 1, context);
    if (isFormulaErrorValue(n)) return n;
    const m = readScalar(args, 2, context);
    if (isFormulaErrorValue(m)) return m;
    const coefficients = collectNumbers([args[3]!], context, { referenceNumericOnly: true });
    if (isFormulaErrorValue(coefficients)) return coefficients;
    if (m === 0) {
      if (x === 0 && n <= 0) return numberError();
      const sum = coefficients.reduce((total, coefficient) => total + coefficient, 0);
      if (sum === 0) return 0;
      const result = sum * x ** n;
      return Number.isFinite(result) ? result : numberError();
    }
    let result = 0;
    for (let index = 0; index < coefficients.length; index++) {
      const exponent = n + index * m;
      if (x === 0 && exponent <= 0) return numberError();
      result += coefficients[index]! * x ** exponent;
    }
    return Number.isFinite(result) ? result : numberError();
  },
};
