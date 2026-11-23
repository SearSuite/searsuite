import { type EvalContext, type FormulaValue } from '@searsuite/sear-domain-formula-engine';
import { isFormulaText } from '@searsuite/sear-foundation-utils';
import { dateTimeParseOptions } from '../dateTime/shared/dateTimeFunctionUtils';
import { parseExcelDateTime } from '../dateTime/shared/dateTimeUtils';

export function numericDateText(value: FormulaValue, context: EvalContext): number | undefined {
  if (isFormulaText(value) && value.numericCoercion === 'deny') return undefined;
  if (typeof value !== 'string' && !isFormulaText(value)) return undefined;
  return parseExcelDateTime(value, dateTimeParseOptions(context))?.serial;
}
