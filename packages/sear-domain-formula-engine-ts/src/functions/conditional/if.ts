/** Returns one value when a condition is true and another when it is false. */
import {
  type FormulaFunction,
  type FormulaArg,
  type FormulaValue,
  type EvalContext,
  FormulaErrorCode,
  createFormulaError,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaError } from '@searsuite/sear-foundation-utils';
import { isTruthy, readLazyArg } from '../shared/helpers';
import { mapArrayValues, readArrayArgument } from '../shared/arrayArgumentValues';
import { conditionalValueAt } from './conditionalArrayValues';

export const IF: FormulaFunction = {
  name: 'IF',
  descriptor: {
    version: 1, category: 'Logical', summary: 'Returns one value when a condition is true and another when it is false.',
    example: '=IF(A1>0,"Positive","Other")',
    parameters: [
      { name: 'logical_test', description: 'Condition to evaluate.' },
      { name: 'value_if_true', description: 'Value returned when the condition is true.' },
      { name: 'value_if_false', description: 'Value returned when the condition is false.', optional: true },
    ],
  },
  lazy: true,
  evaluate(args: FormulaArg[], context: EvalContext): FormulaValue {
    if (args.length < 2 || args.length > 3) return createFormulaError(FormulaErrorCode.Value);
    const value = readArrayArgument(args[0], context);
    if (Array.isArray(value)) {
      let trueValue: FormulaValue | undefined;
      let falseValue: FormulaValue | undefined;
      let trueRead = false;
      let falseRead = false;
      return mapArrayValues(value, (cell, row, col) => {
        const truth = isTruthy(cell);
        if (isFormulaError(truth)) return truth;
        if (truth) {
          if (!trueRead) {
            trueValue = readArrayArgument(args[1], context);
            trueRead = true;
          }
          return conditionalValueAt(trueValue!, row, col);
        }
        if (args[2] === undefined) return false;
        if (!falseRead) {
          falseValue = readArrayArgument(args[2], context);
          falseRead = true;
        }
        return conditionalValueAt(falseValue!, row, col);
      });
    }
    const condition = isTruthy(value);
    if (isFormulaError(condition)) return condition;
    const selected = condition ? args[1] : args[2];
    return selected === undefined ? false : readLazyArg(selected, context);
  },
};
