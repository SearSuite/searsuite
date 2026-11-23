/**
 * RANDARRAY: Generates an array of random numbers with the requested shape and bounds.
 * Example: =RANDARRAY(1,4,5,5,TRUE) returns {5,5,5,5}.
 */
import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { MAX_FORMULA_ARRAY_CELLS } from '../../shared/FormulaArrayLimit';
import { isFormulaErrorValue, numberError, readScalar, strictInteger, valueError } from '../shared/mathUtils';
import { readArg } from '../../shared/FormulaArgumentAccess';
import { randomValue } from './randomUtils';

export const RANDARRAY: FormulaFunction = {
  name: 'RANDARRAY',
  volatile: true,
  evaluate(args, context): FormulaValue {
    if (args.length > 5) return valueError();

    const rows = strictInteger(args, 0, context, 1);
    if (isFormulaErrorValue(rows)) return rows;
    const columns = strictInteger(args, 1, context, 1);
    if (isFormulaErrorValue(columns)) return columns;
    const minimum = readScalar(args, 2, context, 0);
    if (isFormulaErrorValue(minimum)) return minimum;
    const maximum = readScalar(args, 3, context, 1);
    if (isFormulaErrorValue(maximum)) return maximum;

    let wholeNumber = false;
    const wholeNumberArg = args[4];
    if (wholeNumberArg && wholeNumberArg.kind !== 'missing') {
      const value = readArg(wholeNumberArg, context);
      if (isFormulaErrorValue(value)) return value;
      if (typeof value === 'boolean') wholeNumber = value;
      else if (typeof value === 'number') wholeNumber = value !== 0;
      else return valueError();
    }

    if (rows < 1 || columns < 1 || rows > 10_000 || columns > 10_000) return numberError();
    if (rows * columns > MAX_FORMULA_ARRAY_CELLS) return numberError();

    const lower = wholeNumber ? Math.ceil(minimum) : minimum;
    const upper = wholeNumber ? Math.floor(maximum) : maximum;
    if (lower > upper) return numberError();
    const width = upper - lower + (wholeNumber ? 1 : 0);
    if (!Number.isFinite(width)) return numberError();

    const result: FormulaValue[][] = [];
    for (let row = 0; row < rows; row++) {
      const outputRow: FormulaValue[] = [];
      for (let column = 0; column < columns; column++) {
        const value = randomValue(context) * width + lower;
        outputRow.push(wholeNumber ? Math.floor(value) : value);
      }
      result.push(outputRow);
    }
    return result;
  },
};
