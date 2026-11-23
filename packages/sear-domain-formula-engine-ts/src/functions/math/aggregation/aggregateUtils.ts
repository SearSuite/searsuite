import {
  FormulaErrorCode,
  createFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaRangeCell,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import {
  flatten,
  isFormulaErrorValue,
  isRangeArgument,
  numericOrZero,
  numberError,
  valueError,
} from '../shared/mathUtils';
import { forEachFormulaRangeCellWithMetadata, readArg, resolveFormulaRange } from '../../shared/helpers';
import { resolveConditionalReference } from '../../shared/conditionalReference';

export interface AggregateItem {
  readonly value: FormulaValue;
  readonly cell?: FormulaRangeCell;
}

export interface AggregateOptions {
  readonly ignoreHidden: boolean;
  readonly ignoreErrors: boolean;
  readonly ignoreNested: boolean;
  readonly countErrors?: boolean;
}

export function collectAggregateItems(
  args: FormulaArg[],
  context: EvalContext,
  options: AggregateOptions,
): AggregateItem[] | ReturnType<typeof valueError> {
  const items: AggregateItem[] = [];

  for (const arg of args) {
    const reference = resolveConditionalReference(arg, context);
    if (isFormulaErrorValue(reference)) return reference;
    if (reference || isRangeArgument(arg)) {
      const range = reference ?? resolveFormulaRange(arg, context);
      if (!range || isFormulaErrorValue(range)) return range ?? valueError();

      let callbackError: ReturnType<typeof valueError> | undefined;
      const error = forEachFormulaRangeCellWithMetadata(range, context, (cell) => {
        if (cell.source === 'empty' || shouldIgnoreCell(cell, options)) return;
        if (isFormulaErrorValue(cell.value)) {
          if (options.ignoreErrors) return;
          if (options.countErrors) {
            items.push({ value: cell.value, cell });
            return;
          }
          callbackError = cell.value;
          return false;
        }
        items.push({ value: cell.value, cell });
      });
      if (error) return error;
      if (callbackError) return callbackError;
      continue;
    }

    const value = readArg(arg, context);
    if (isFormulaErrorValue(value)) {
      if (options.ignoreErrors) continue;
      if (options.countErrors) {
        items.push({ value });
        continue;
      }
      return value;
    }
    for (const item of flatten(value)) {
      if (isFormulaErrorValue(item)) {
        if (options.ignoreErrors) continue;
        if (options.countErrors) {
          items.push({ value: item });
          continue;
        }
        return item;
      }
      items.push({ value: item });
    }
  }
  return items;
}

function shouldIgnoreCell(cell: FormulaRangeCell, options: AggregateOptions): boolean {
  if (cell.filtered === true || (options.ignoreHidden && cell.hidden === true)) return true;
  return (
    options.ignoreNested && typeof cell.formulaName === 'string' && /^(SUBTOTAL|AGGREGATE)$/i.test(cell.formulaName)
  );
}

export function applyAggregate(functionNumber: number, items: AggregateItem[], k?: number): FormulaValue {
  const values = items.map((item) => item.value);
  const numbers = items.flatMap(({ value, cell }) => {
    if (typeof value === 'number') return [value];
    if (cell || (typeof value !== 'boolean' && !isFormulaText(value))) return [];
    return [numericOrZero(value)];
  });

  switch (functionNumber) {
    case 1:
      return numbers.length === 0 ? createFormulaError(FormulaErrorCode.DivisionByZero) : average(numbers);
    case 2:
      return numbers.length;
    case 3:
      return values.length;
    case 4:
      return numbers.length === 0 ? 0 : numbers.reduce((max, value) => Math.max(max, value), -Infinity);
    case 5:
      return numbers.length === 0 ? 0 : numbers.reduce((min, value) => Math.min(min, value), Infinity);
    case 6:
      return numbers.length === 0 ? 0 : numbers.reduce((product, value) => product * value, 1);
    case 7:
      return standardDeviation(numbers, true);
    case 8:
      return standardDeviation(numbers, false);
    case 9:
      return numbers.reduce((sum, value) => sum + value, 0);
    case 10:
      return variance(numbers, true);
    case 11:
      return variance(numbers, false);
    case 12:
      return median(numbers);
    case 13:
      return mode(numbers);
    case 14:
      return orderStatistic(numbers, k, true);
    case 15:
      return orderStatistic(numbers, k, false);
    case 16:
      return percentile(numbers, k, false);
    case 17:
      return percentile(numbers, typeof k === 'number' ? k / 4 : undefined, false);
    case 18:
      return percentile(numbers, k, true);
    case 19:
      return percentile(numbers, typeof k === 'number' ? k / 4 : undefined, true);
    default:
      return valueError();
  }
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values: number[], sample: boolean): number | ReturnType<typeof valueError> {
  if (values.length === 0 || (sample && values.length < 2)) {
    return createFormulaError(FormulaErrorCode.DivisionByZero);
  }
  const mean = average(values);
  const denominator = sample ? values.length - 1 : values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / denominator;
}

function standardDeviation(values: number[], sample: boolean): number | ReturnType<typeof valueError> {
  const value = variance(values, sample);
  return isFormulaErrorValue(value) ? value : Math.sqrt(value);
}

function median(values: number[]): FormulaValue {
  if (values.length === 0) return numberError();
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function mode(values: number[]): FormulaValue {
  if (values.length === 0) return createFormulaError(FormulaErrorCode.NotAvailable);
  const counts = new Map<number, number>();
  let best = values[0]!;
  let bestCount = 0;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count > bestCount || (count === bestCount && value < best)) {
      best = value;
      bestCount = count;
    }
  }
  return bestCount > 1 ? best : createFormulaError(FormulaErrorCode.NotAvailable);
}

function orderStatistic(values: number[], k: number | undefined, largest: boolean): FormulaValue {
  if (k === undefined || !Number.isInteger(k) || k < 1 || k > values.length) return valueError();
  const sorted = values.slice().sort((left, right) => (largest ? right - left : left - right));
  return sorted[k - 1]!;
}

function percentile(
  values: number[],
  k: number | undefined,
  exclusive: boolean,
): number | ReturnType<typeof numberError> {
  if (k === undefined || k < 0 || k > 1 || values.length === 0) return numberError();
  const sorted = values.slice().sort((left, right) => left - right);
  const position = exclusive ? k * (sorted.length + 1) - 1 : k * (sorted.length - 1);
  if (position < 0 || position > sorted.length - 1) return numberError();
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}
