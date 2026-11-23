/**
 * PERCENTOF: Returns the proportion represented by one value or array within another.
 * Example: =PERCENTOF({25},{100}) returns 0.25.
 */
import { isFormulaError, type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { resolveConditionalReference } from '../../shared/conditionalReference';
import { collectNumbers, divisionError, isFormulaErrorValue, numberError, valueError } from '../shared/mathUtils';

export const PERCENTOF: FormulaFunction = {
  name: 'PERCENTOF',
  evaluate(args, context): FormulaValue {
    if (args.length !== 2) return valueError();
    const subset = collectNumbers([args[0]!], context, { referenceNumericOnly: true });
    if (isFormulaErrorValue(subset)) {
      const reference = resolveConditionalReference(args[0], context);
      return reference && !isFormulaError(reference) ? numberError() : subset;
    }
    const all = collectNumbers([args[1]!], context, { referenceNumericOnly: true });
    if (isFormulaErrorValue(all)) {
      const reference = resolveConditionalReference(args[1], context);
      return reference && !isFormulaError(reference) ? numberError() : all;
    }
    const denominator = all.reduce((sum, value) => sum + value, 0);
    if (denominator === 0) return divisionError();
    return subset.reduce((sum, value) => sum + value, 0) / denominator;
  },
};
