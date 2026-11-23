/**
 * GCD: Returns the greatest common divisor of numeric values.
 * Example: =GCD(24,36) returns 12.
 */
import { FormulaNodeKind, type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { resolveConditionalReference } from '../../shared/conditionalReference';
import { readArg } from '../../shared/helpers';
import { collectNumbers, collectReferenceCells, isFormulaErrorValue, isRangeCell, numberError, valueError } from '../shared/mathUtils';
import { gcd } from './combinatoricsUtils';

export const GCD: FormulaFunction = {
  name: 'GCD',
  evaluate(args, context): FormulaValue {
    if (args.length < 1) return valueError();
    const numericArgs = [];
    const rangeValues: number[] = [];
    for (const arg of args) {
      const reference = resolveConditionalReference(arg, context);
      if (isFormulaErrorValue(reference)) return reference;
      if (reference) {
        const cells = collectReferenceCells(arg, context, reference);
        if (isFormulaErrorValue(cells)) return cells;
        for (const cell of cells) {
          const value = isRangeCell(cell) ? cell.value : cell;
          if (isFormulaErrorValue(value)) return value;
          if (typeof value === 'number') rangeValues.push(value);
        }
        continue;
      }
      const value = readArg(arg, context);
      if (isFormulaErrorValue(value)) return value;
      if (typeof value === 'boolean') {
        if (arg.kind !== 'value' || arg.sourceKind !== FormulaNodeKind.Boolean) {
          if (!value) continue;
          return valueError();
        }
      }
      const text = isFormulaText(value) ? value.value : value;
      if (typeof text === 'string' && (text === '' ||
        (arg.kind !== 'value' || arg.sourceAst?.kind === FormulaNodeKind.Call) &&
        !Number.isFinite(Number(text)))) return valueError();
      numericArgs.push(arg);
    }
    const values = collectNumbers(numericArgs, context);
    if (isFormulaErrorValue(values)) return values;
    let result = 0;
    for (const value of [...values, ...rangeValues]) {
      if (!Number.isFinite(value) || value < 0) return numberError();
      result = gcd(result, Math.trunc(value));
    }
    return Math.abs(result);
  },
};
