import { type FormulaFunction, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { numericDateText } from '../../shared/formulaNumericDateText';
import { readArg } from '../../shared/helpers';
import { isFormulaErrorValue, numberError, readScalar, valueError } from '../shared/mathUtils';

export function roundingFunction(name: string, operation: (value: number, digits: number) => number): FormulaFunction {
  return {
    name,
    evaluate(args, context): FormulaValue {
      if (args.length !== 2) return valueError();
      const value = readScalar(args, 0, context);
      if (isFormulaErrorValue(value)) return value;
      const digits = readScalar(args, 1, context);
      if (isFormulaErrorValue(digits)) return digits;
      const result = operation(value, Math.trunc(digits));
      return Number.isFinite(result) ? result : numberError();
    },
  };
}

export function roundingMultipleFunction(
  name: string,
  operation: (number: number, significance: number, mode: number) => number,
  hasMode: boolean,
): FormulaFunction {
  return {
    name,
    evaluate(args, context): FormulaValue {
      if (args.length < 1 || args.length > (hasMode ? 3 : 2)) return valueError();
      const input = readArg(args[0]!, context);
      const text = isFormulaText(input) ? input.value : input;
      if (typeof text === 'string' && !Number.isFinite(Number(text)) &&
        numericDateText(input, context) !== undefined) return valueError();
      const number = readScalar(args, 0, context);
      if (isFormulaErrorValue(number)) return number;
      const significance = readScalar(args, 1, context, 1);
      if (isFormulaErrorValue(significance)) return significance;
      if (significance === 0) return 0;
      const mode = hasMode ? readScalar(args, 2, context, 0) : 0;
      if (isFormulaErrorValue(mode)) return mode;
      const quotient = number / Math.abs(significance);
      if (Number.isFinite(quotient) && quotient !== 0 &&
        normalizeNearInteger(quotient) !== quotient) return number;
      const result = operation(number, significance, mode);
      return Number.isFinite(result) ? result : numberError();
    },
  };
}

export function factorial(value: number): number | ReturnType<typeof numberError> {
  if (!Number.isFinite(value) || value < 0) return numberError();
  let result = 1;
  for (let current = 2; current <= value; current++) {
    result *= current;
    if (!Number.isFinite(result)) return numberError();
  }
  return result;
}

export function doubleFactorial(value: number): number | ReturnType<typeof numberError> {
  if (!Number.isFinite(value) || value < 0) return numberError();
  let result = 1;
  for (let current = Math.trunc(value); current > 1; current -= 2) {
    result *= current;
    if (!Number.isFinite(result)) return numberError();
  }
  return result;
}

export function normalizeNearInteger(value: number): number {
  const nearest = Math.round(value);
  if (nearest === 0) return value;
  return Math.abs(value - nearest) <= Number.EPSILON * Math.max(1, Math.abs(value)) * 2
    ? nearest : value;
}

export function roundHalfAwayFromZero(value: number, digits: number): number {
  const factor = 10 ** digits;
  if (factor === 0) return 0;
  if (!Number.isFinite(factor)) return value;
  if (!Number.isFinite(value * factor)) return value;
  const scaled = Math.abs(value) * factor;
  const half = Math.floor(scaled) + 0.5;
  const tolerance = Math.min(1e-10, Number.EPSILON * Math.max(1, scaled) * 2);
  const rounded = Math.abs(scaled - half) <= tolerance ? Math.round(half) : Math.round(scaled);
  return (Math.sign(value) * rounded) / factor;
}

export function roundAwayFromZero(value: number, digits: number): number {
  const factor = 10 ** digits;
  if (factor === 0) return 0;
  if (!Number.isFinite(factor)) return value;
  if (!Number.isFinite(value * factor)) return value;
  return (Math.sign(value) * Math.ceil(normalizeNearInteger(Math.abs(value) * factor))) / factor;
}

export function truncateAwayFromZero(value: number, digits: number): number {
  const factor = 10 ** digits;
  if (factor === 0) return 0;
  if (!Number.isFinite(factor)) return value;
  return (Math.sign(value) * Math.floor(Math.abs(value) * factor)) / factor;
}
