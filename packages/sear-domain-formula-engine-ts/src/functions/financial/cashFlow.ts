import {
  isFormulaArgumentKind,
  FormulaNodeKind,
  type EvalContext,
  type FormulaArg,
  type FormulaError,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaText, toNumberOrError } from '@searsuite/sear-foundation-utils';
import { parseNumberValue } from '@searsuite/sear-domain-format';
import { collectValues, isFormulaErrorValue } from '../math/shared/mathUtils';
import { readArg, resolveFormulaRange } from '../shared/helpers';
import { forEachFormulaRangeCell } from '../shared/FormulaRangeAccess';
import { forEachFormulaRangeCellWithMetadata } from '../shared/FormulaRangeAccess';
import { resolveConditionalReference } from '../shared/conditionalReference';
import { parseExcelDate } from '../dateTime/shared/dateTimeUtils';
import { dateTimeParseOptions, isIndirectSlashDateText } from '../dateTime/shared/dateTimeFunctionUtils';
import { financialDivisionError, financialNumberError, financialValueError } from './dayCount';

export type FinancialNumberResult = number | FormulaError;

export function isTextualFinancialReference(arg: FormulaArg | undefined, context: EvalContext): boolean {
  const reference = resolveConditionalReference(arg, context);
  if (!reference || isFormulaErrorValue(reference) ||
    reference.startRow !== reference.endRow || reference.startCol !== reference.endCol) return false;
  const value = 'sheetName' in reference.source
    ? context.getWorkbookCellValue?.(reference.source.sheetName, reference.startRow, reference.startCol)
    : context.getCellValue(reference.startRow, reference.startCol);
  return typeof value === 'string' || isFormulaText(value);
}

/** Reads a scalar financial input, preserving formula errors. */
export function readFinancialNumber(
  arg: FormulaArg | undefined,
  context: EvalContext,
  options: { acceptLocalizedCurrency?: boolean } = {},
): FinancialNumberResult {
  if (!arg || isFormulaArgumentKind(arg, 'missing')) return financialValueError();
  const value = readArg(arg, context);
  if (isFormulaErrorValue(value)) return value;
  if (isIndirectSlashDateText(arg, value)) return financialValueError();
  if (Array.isArray(value)) return financialValueError();
  const text = isFormulaText(value) ? value.value : value;
  if (typeof text === 'string' && text.trim() === '') return financialValueError();
  if (typeof text === 'string' && /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*%\s*$/.test(text))
    return Number(text.trim().slice(0, -1).trim()) / 100;
  const currencyPrefix = options.acceptLocalizedCurrency || isTextualFinancialReference(arg, context)
    ? /^\s*[$¥￥]\s*/
    : /^\s*\$\s*/;
  if (typeof text === 'string' && currencyPrefix.test(text) &&
    /^[+-]?\d/.test(text.replace(currencyPrefix, ''))) {
    const currency = parseNumberValue(text.replace(currencyPrefix, ''));
    return currency ?? financialValueError();
  }
  if (isFormulaText(value) && value.numericCoercion === 'deny') return financialValueError();
  const numeric = toNumberOrError(value);
  if (!isFormulaErrorValue(numeric)) return numeric;
  return typeof text === 'string'
    ? parseExcelDate(text, dateTimeParseOptions(context)) ?? financialValueError()
    : financialValueError();
}

/** Collects a scalar, array, or range argument into finite numeric cash flows. */
export function collectFinancialCashFlows(
  arg: FormulaArg | undefined, context: EvalContext, acceptFormattedText = false,
): number[] | FormulaError {
  return collectFinancialNumbers(arg, context, false, false, acceptFormattedText);
}

/** Multi-cell schedules reject stored text rates even when the text is numeric. */
export function collectFinancialScheduleRates(arg: FormulaArg | undefined, context: EvalContext): number[] | FormulaError {
  if (!arg || isFormulaArgumentKind(arg, 'missing')) return financialValueError();
  const reference = resolveConditionalReference(arg, context);
  if (isFormulaErrorValue(reference)) return reference;
  const multiCellRange = Boolean(reference && (
    reference.startRow !== reference.endRow || reference.startCol !== reference.endCol
  ));
  const rates = collectFinancialNumbers(arg, context, false, multiCellRange);
  return multiCellRange && isFormulaErrorValue(rates) ? financialValueError() : rates;
}

/** Date arguments use whole serial days and reject boolean values. */
export function collectFinancialDateSerials(
  arg: FormulaArg | undefined, context: EvalContext, acceptFormattedText = false,
): number[] | FormulaError {
  return collectFinancialNumbers(arg, context, true, false, acceptFormattedText);
}

function collectFinancialNumbers(
  arg: FormulaArg | undefined,
  context: EvalContext,
  dateSerials: boolean,
  rejectText = false,
  acceptFormattedText = false,
): number[] | FormulaError {
  if (!arg || isFormulaArgumentKind(arg, 'missing')) return financialValueError();
  const values = collectValues(arg, context);
  if (isFormulaErrorValue(values)) return values;
  const dateReference = dateSerials ? resolveConditionalReference(arg, context) : null;
  const result: number[] = [];
  for (const value of values) {
    const text = isFormulaText(value) ? value.value : value;
    const formatted = acceptFormattedText && typeof text === 'string'
      ? dateSerials ? parseExcelDate(text, dateTimeParseOptions(context)) : parseNumberValue(text)
      : null;
    const referencedNumericText = dateReference && !isFormulaErrorValue(dateReference) &&
      typeof text === 'string' && text.trim() !== '' && Number.isFinite(Number(text));
    if (isFormulaErrorValue(value) || (isFormulaText(value) && value.numericCoercion === 'deny' && formatted === null) ||
      (dateSerials && (typeof value === 'boolean' ||
        (typeof text === 'string' && !referencedNumericText && formatted === null))) ||
      (rejectText && (typeof value === 'string' || isFormulaText(value))))
      return valueErrorLike(value);
    const numeric = formatted ?? toNumberOrError(value);
    if (isFormulaErrorValue(numeric) || !Number.isFinite(numeric)) return financialValueError();
    result.push(dateSerials ? Math.trunc(numeric) : numeric);
  }
  return result.length > 0 ? result : financialValueError();
}

/** NPV ignores nonnumeric cells in references without consuming a period. */
export function collectNpvCashFlows(arg: FormulaArg | undefined, context: EvalContext): number[] | FormulaError {
  if (!arg || isFormulaArgumentKind(arg, 'missing')) return financialValueError();
  const reference = resolveConditionalReference(arg, context);
  if (isFormulaErrorValue(reference)) return reference;
  if (!reference) return collectFinancialCashFlows(arg, context);
  const result: number[] = [];
  let selectedError: FormulaError | undefined;
  const traversalError = forEachFormulaRangeCellWithMetadata(reference, context, (cell) => {
    if (isFormulaErrorValue(cell.value)) {
      selectedError = cell.value;
      return false;
    }
    if (cell.source !== 'empty' && typeof cell.value === 'number') result.push(cell.value);
  });
  return traversalError ?? selectedError ?? result;
}

export function collectIrrCashFlows(arg: FormulaArg | undefined, context: EvalContext): number[] | FormulaError {
  const cashFlows = collectNpvCashFlows(arg, context);
  if (!isFormulaErrorValue(cashFlows)) return cashFlows;
  const reference = resolveConditionalReference(arg, context);
  if (!reference || isFormulaErrorValue(reference)) return cashFlows;
  let hasPositive = false;
  let hasNegative = false;
  forEachFormulaRangeCellWithMetadata(reference, context, (cell) => {
    if (cell.source !== 'empty' && typeof cell.value === 'number') {
      hasPositive ||= cell.value > 0;
      hasNegative ||= cell.value < 0;
    }
    return !(hasPositive && hasNegative);
  });
  return hasPositive && hasNegative ? cashFlows : financialValueError();
}

/** Streams numeric values from a range without allocating an intermediate matrix. */
export function forEachFinancialCashFlow(
  arg: FormulaArg,
  context: EvalContext,
  callback: (value: number, index: number) => boolean | void,
): FormulaError | undefined {
  if (
    !isFormulaArgumentKind(arg, FormulaNodeKind.Range) &&
    !isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookRange) &&
    !isFormulaArgumentKind(arg, FormulaNodeKind.ColumnRange) &&
    !isFormulaArgumentKind(arg, FormulaNodeKind.RowRange)
  ) {
    const value = readFinancialNumber(arg, context);
    if (typeof value !== 'number') return value;
    callback(value, 0);
    return undefined;
  }
  const range = resolveFormulaRange(arg, context);
  if (!range || 'kind' in range) return range ?? financialValueError();
  let index = 0;
  let failure: FormulaError | undefined;
  return (
    forEachFormulaRangeCell(range, context, (value) => {
      const numeric = readFinancialNumber({ kind: 'value', value }, context);
      if (typeof numeric !== 'number') {
        failure = numeric;
        return false;
      }
      const shouldContinue = callback(numeric, index++);
      return shouldContinue;
    }) ?? failure
  );
}

/** Computes periodic NPV. The first value is discounted by one period. */
export function periodicNpv(rate: number, cashFlows: readonly number[]): FinancialNumberResult {
  if (
    !Number.isFinite(rate) ||
    cashFlows.length === 0 ||
    cashFlows.some((value) => !Number.isFinite(value))
  )
    return financialNumberError();
  if (rate === -1) return financialDivisionError();
  let total = 0;
  for (let index = 0; index < cashFlows.length; index++) total += cashFlows[index] / Math.pow(1 + rate, index + 1);
  if (Number.isFinite(total)) return total;
  const scale = cashFlows.reduce((largest, value) => Math.max(largest, Math.abs(value)), 0);
  let scaledTotal = 0;
  for (let index = 0; index < cashFlows.length; index++)
    scaledTotal += (cashFlows[index] / scale) / Math.pow(1 + rate, index + 1);
  const stableTotal = scaledTotal * scale;
  return Number.isFinite(stableTotal) ? stableTotal : financialNumberError();
}

/** Computes the future value of a periodic annuity. */
export function futureValue(
  rate: number,
  periods: number,
  payment: number,
  presentValue: number,
  type = 0,
): FinancialNumberResult {
  if (![rate, periods, payment, presentValue, type].every(Number.isFinite) || (type !== 0 && type !== 1))
    return financialValueError();
  if (rate === 0) return -(presentValue + payment * periods);
  const factorMinusOne = 1 + rate === 1
    ? Math.expm1(periods * Math.log1p(rate))
    : Math.pow(1 + rate, periods) - 1;
  const factor = factorMinusOne + 1;
  if (!Number.isFinite(factor)) return financialNumberError();
  const result = -(presentValue * factor + (payment * (1 + rate * type) * factorMinusOne) / rate);
  return Number.isFinite(result) ? result : financialNumberError();
}

/** Computes a periodic payment for an annuity. */
export function payment(
  rate: number,
  periods: number,
  presentValue: number,
  future = 0,
  type = 0,
): FinancialNumberResult {
  if (![rate, periods, presentValue, future, type].every(Number.isFinite) || (type !== 0 && type !== 1))
    return financialValueError();
  if (rate === 0) return periods === 0 ? financialDivisionError() : -(presentValue + future) / periods;
  if (periods === 0) return financialNumberError();
  // Nonzero future values can amplify a one-ULP Math.pow difference across Node versions.
  const factorMinusOne = 1 + rate === 1
    ? Math.expm1(periods * Math.log1p(rate))
    : (future === 0
      ? Math.pow(1 + rate, periods)
      : Number(Math.pow(1 + rate, periods).toPrecision(16))) - 1;
  const factor = factorMinusOne + 1;
  if (!Number.isFinite(factor)) return financialNumberError();
  const denominator = (1 + rate * type) * factorMinusOne;
  if (denominator === 0) return financialDivisionError();
  const result = -(rate * (future + presentValue * factor)) / denominator;
  return Number.isFinite(result) ? result : financialNumberError();
}

function valueErrorLike(value: unknown): FormulaError {
  return isFormulaErrorValue(value) ? value : financialValueError();
}
