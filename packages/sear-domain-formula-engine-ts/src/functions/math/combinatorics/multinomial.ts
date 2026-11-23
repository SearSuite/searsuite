/**
 * MULTINOMIAL: Returns the multinomial coefficient for a set of numbers.
 * Example: =MULTINOMIAL(1,1,1) returns 6.
 */
import { FormulaNodeKind, type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { resolveConditionalReference } from '../../shared/conditionalReference';
import { readArg } from '../../shared/helpers';
import { collectNumbers, isFormulaErrorValue, numberError, valueError } from '../shared/mathUtils';
import { combination } from './combinatoricsUtils';

export const MULTINOMIAL: FormulaFunction = {
  name: 'MULTINOMIAL',
  evaluate(args, context): FormulaValue {
    if (args.length < 1) return valueError();
    const numericArgs: typeof args = [];
    for (const arg of args) {
      const reference = resolveConditionalReference(arg, context);
      if (isFormulaErrorValue(reference)) return reference;
      if (reference) {
        numericArgs.push(arg);
        continue;
      }
      const value = readArg(arg, context);
      if (isFormulaErrorValue(value)) return value;
      const text = isFormulaText(value) ? value.value : value;
      if (text === '') return valueError();
      if (typeof value === 'boolean' && (arg.kind !== 'value' || arg.sourceKind !== FormulaNodeKind.Boolean))
        continue;
      if (typeof text === 'string' && arg.kind === 'value' && arg.sourceKind === FormulaNodeKind.Call &&
        (/^-[\d.]+(?:e[+-]?\d+)?$/i.test(text) || /^\d{4}-\d{1,2}-\d{1,2}$/.test(text)))
        continue;
      if (typeof text === 'string' && /^\d{4}-\d{1,2}-\d{1,2}$/.test(text) && arg.kind !== 'value')
        continue;
      numericArgs.push(arg);
    }
    const values = collectNumbers(numericArgs, context, { referenceNumericOnly: true });
    if (isFormulaErrorValue(values)) return values;
    if (values.some((value) => value < 0 || !Number.isFinite(value))) return numberError();
    const integers = values.map(Math.trunc);
    let total = 0;
    for (const value of integers) {
      total += value;
      // 170! is finite as a JavaScript number; 171! is not.
      if (total > 170) return numberError();
    }
    let result = 1;
    total = 0;
    for (const value of integers) {
      total += value;
      const part = combination(total, value, false);
      if (isFormulaErrorValue(part)) return part;
      result *= part;
      if (!Number.isFinite(result)) return numberError();
    }
    return result;
  },
};
