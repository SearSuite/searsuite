/**
 * LCM: Returns the least common multiple of numeric values.
 * Example: =LCM(4,6) returns 12.
 */
import { FormulaNodeKind, type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { resolveConditionalReference } from '../../shared/conditionalReference';
import { numericDateText } from '../../shared/formulaNumericDateText';
import { readArg } from '../../shared/helpers';
import { collectReferenceCells, flatten, isFormulaErrorValue, isRangeCell, numericValue, numberError, valueError } from '../shared/mathUtils';
import { gcd } from './combinatoricsUtils';

export const LCM: FormulaFunction = {
  name: 'LCM',
  evaluate(args, context): FormulaValue {
    if (args.length < 1) return valueError();
    const values: number[] = [];
    for (const arg of args) {
      const reference = resolveConditionalReference(arg, context);
      if (isFormulaErrorValue(reference)) return reference;
      if (!reference && (arg.kind === 'expression' ||
        arg.kind === 'value' && arg.sourceAst?.kind === FormulaNodeKind.Call) &&
        readArg(arg, context) === false) return valueError();
      const entries = collectReferenceCells(arg, context, reference);
      if (isFormulaErrorValue(entries)) return entries;
      for (const entry of entries) {
        if (isRangeCell(entry)) {
          const text = isFormulaText(entry.value) ? entry.value.value : entry.value;
          if (entry.source === 'empty' || typeof text === 'string' || typeof text === 'boolean') continue;
        }
        for (const value of flatten(isRangeCell(entry) ? entry.value : entry)) {
          if (value === '' || (isFormulaText(value) && value.value === '')) return valueError();
          const numeric = numericValue(value);
          const converted = isFormulaErrorValue(numeric) ? numericDateText(value, context) ?? numeric : numeric;
          if (isFormulaErrorValue(converted)) return converted;
          values.push(converted);
        }
      }
    }
    let result = 1;
    for (const value of values) {
      const integer = Math.trunc(value);
      if (!Number.isFinite(integer) || value < 0) return numberError();
      if (result === 0 || integer === 0) result = 0;
      else result = Math.abs((result / gcd(result, integer)) * integer);
      if (!Number.isFinite(result)) return numberError();
    }
    return result;
  },
};
