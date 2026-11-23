/**
 * AVERAGE: Returns the arithmetic mean of numeric values.
 * Example: =AVERAGE(10,20,30) returns 20.
 */
import {
  type FormulaFunction,
  type FormulaArg,
  type FormulaValue,
  type EvalContext,
  FormulaErrorCode,
  createFormulaError,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaError, isFormulaText, toNumberOrError } from '@searsuite/sear-foundation-utils';
import { flatten } from '../shared/mathUtils';
import { readArg, forEachFormulaRangeCellWithMetadata } from '../../shared/helpers';
import { resolveConditionalReference } from '../../shared/conditionalReference';
import { numericDateText } from '../../shared/formulaNumericDateText';

export const AVERAGE: FormulaFunction = {
  name: 'AVERAGE',
  descriptor: {
    version: 1, category: 'Math', summary: 'Returns the arithmetic mean of numeric values.',
    example: '=AVERAGE(A1:A5)',
    parameters: [{ name: 'number', description: 'Number or range to average.', repeating: true }],
  },
  evaluate(args: FormulaArg[], context: EvalContext): FormulaValue {
    let total = 0;
    let count = 0;
    let average: number | undefined;
    const include = (value: number): void => {
      if (average === undefined) {
        const next = total + value;
        if (Number.isFinite(next)) {
          total = next;
          count++;
          return;
        }
        average = total / count;
      }
      const nextCount = count + 1;
      const difference = value - average;
      average = Number.isFinite(difference)
        ? average + difference / nextCount
        : average * (count / nextCount) + value / nextCount;
      count = nextCount;
    };
    for (const arg of args) {
      const range = resolveConditionalReference(arg, context);
      if (range && !('kind' in range)) {
        let rangeError: FormulaValue | undefined;
        const error = forEachFormulaRangeCellWithMetadata(range, context, (cell) => {
          if (cell.source === 'empty') return;
          const value = cell.value;
          if (isFormulaError(value)) {
            rangeError = value;
            return false;
          }
          if (typeof value === 'number') {
            include(value);
          }
        });
        if (error) return error;
        if (rangeError) return rangeError;
        continue;
      }
      if (range) return range;
      const value = readArg(arg, context);
      if (isFormulaError(value)) return value;
      if (Array.isArray(value)) {
        for (const item of flatten(value)) {
          if (isFormulaError(item)) return item;
          if (typeof item === 'number') {
            include(item);
          }
        }
        continue;
      }
      if (typeof value === 'string' && value.trim() === '')
        return createFormulaError(FormulaErrorCode.Value);
      const number =
        isFormulaText(value) && value.numericCoercion === 'deny'
          ? createFormulaError(FormulaErrorCode.Value)
          : toNumberOrError(value);
      if (isFormulaError(number)) {
        const date = numericDateText(value, context);
        if (date === undefined) return number;
        include(date);
      } else include(number);
    }
    return count === 0 ? createFormulaError(FormulaErrorCode.DivisionByZero) : average ?? total / count;
  },
};
