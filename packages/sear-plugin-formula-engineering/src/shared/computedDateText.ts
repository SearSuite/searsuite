import {
  isFormulaArgumentKind,
  FormulaNodeKind,
  type EvalContext,
  type FormulaArg,
  type FormulaValue,
} from '@searsuite/sear-domain-formula-engine';
import { numericDateText } from '@searsuite/sear-domain-formula-engine-ts';
import { isFormulaText } from '@searsuite/sear-foundation-utils';

export function dateTextAsNumber(value: FormulaValue, context: EvalContext): FormulaValue {
  const text = isFormulaText(value) ? value.value : value;
  if (typeof text !== 'string' || text.trim() === '' || Number.isFinite(Number(text))) return value;
  return numericDateText(value, context) ?? value;
}

export function computedDateTextAsNumber(
  value: FormulaValue,
  arg: FormulaArg | undefined,
  context: EvalContext,
): FormulaValue {
  return isFormulaArgumentKind(arg, 'value') && arg.sourceKind === FormulaNodeKind.Call
    ? dateTextAsNumber(value, context)
    : value;
}
