/**
 * SUBTOTAL: Calculates a subtotal for a range using a selected aggregation code.
 * Example: =SUBTOTAL(9,A1:A3) returns the sum of A1:A3.
 */
import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, readScalar, valueError } from '../shared/mathUtils';
import { collectAggregateItems, applyAggregate } from './aggregateUtils';

export const SUBTOTAL: FormulaFunction = {
  name: 'SUBTOTAL',
  evaluate(args, context): FormulaValue {
    if (args.length < 2) return valueError();
    const functionNumberValue = readScalar(args, 0, context);
    if (isFormulaErrorValue(functionNumberValue)) return functionNumberValue;
    const functionNumber = Math.trunc(functionNumberValue);

    const ignoreHidden = functionNumber >= 100;
    const baseFunction = ignoreHidden ? functionNumber - 100 : functionNumber;
    if (baseFunction < 1 || baseFunction > 11) return valueError();

    const items = collectAggregateItems(args.slice(1), context, {
      ignoreHidden,
      ignoreErrors: false,
      ignoreNested: true,
      countErrors: baseFunction === 2 || baseFunction === 3,
    });
    if (isFormulaErrorValue(items)) return items;
    return applyAggregate(baseFunction, items);
  },
};
