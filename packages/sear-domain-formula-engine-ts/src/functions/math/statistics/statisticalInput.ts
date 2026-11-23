import {
  FormulaNodeKind,
  FormulaErrorCode,
  createFormulaError,
  type EvalContext,
  type FormulaArg,
  type FormulaError,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaError, isFormulaText, toNumberOrError } from '@searsuite/sear-foundation-utils';
import { parseExcelDate } from '../../dateTime/shared/dateTimeUtils';
import { dateTimeParseOptions } from '../../dateTime/shared/dateTimeFunctionUtils';
import { readArg } from '../../shared/helpers';

/** Returns a number only for direct literal scalar inputs handled by statistical functions. */
export function directStatisticalNumber(arg: FormulaArg | undefined, context: EvalContext): number | FormulaError | undefined {
  if (!arg || arg.kind === 'missing') return createFormulaError(FormulaErrorCode.Value);
  if (arg.kind !== 'value') return undefined;
  if (arg.sourceKind === FormulaNodeKind.Boolean) return arg.value ? 1 : 0;
  if (arg.sourceKind !== FormulaNodeKind.String) return undefined;
  const text = arg.value as string;
  if (text.trim() === '') return createFormulaError(FormulaErrorCode.Value);
  const number = toNumberOrError(text);
  if (!isFormulaError(number)) return number;
  return parseExcelDate(text, dateTimeParseOptions(context)) ?? createFormulaError(FormulaErrorCode.Value);
}

/** Reads a scalar distribution parameter, including date-formatted text. */
export function statisticalScalarNumber(arg: FormulaArg, context: EvalContext): number | FormulaError {
  const value = readArg(arg, context);
  if (isFormulaError(value)) return value as FormulaError;
  if (Array.isArray(value)) return createFormulaError(FormulaErrorCode.Value);
  const text = isFormulaText(value) ? value.value : value;
  if (typeof text === 'string' && text.trim() === '') return createFormulaError(FormulaErrorCode.Value);
  const number = toNumberOrError(value);
  if (!isFormulaError(number)) return number;
  return typeof text === 'string'
    ? parseExcelDate(text, dateTimeParseOptions(context)) ?? createFormulaError(FormulaErrorCode.Value)
    : createFormulaError(FormulaErrorCode.Value);
}

