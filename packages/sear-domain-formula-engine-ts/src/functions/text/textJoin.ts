import {
  FormulaNodeKind,
  isFormulaArgumentKind,
  type EvalContext,
  type FormulaArg,
  type FormulaFunction,
} from '@searsuite/sear-domain-formula-engine';
import { booleanArg, isFormulaErrorValue, textArg, valueError } from './textFormat/FormulaTextValues';
import { flattenTextArg } from './textFunctionHelpers';
import { forEachFormulaRangeCellWithMetadata, resolveFormulaRange } from '../shared/helpers';

function isEmptyDelimiterRange(arg: FormulaArg | undefined, context: EvalContext): boolean {
  if (
    !arg ||
    !(isFormulaArgumentKind(arg, FormulaNodeKind.Range) || isFormulaArgumentKind(arg, FormulaNodeKind.WorkbookRange))
  )
    return false;
  const range = resolveFormulaRange(arg, context);
  if (!range || isFormulaErrorValue(range)) return false;
  let empty = true;
  const error = forEachFormulaRangeCellWithMetadata(range, context, (cell) => {
    if (cell.source !== 'empty') {
      empty = false;
      return false;
    }
  });
  return !error && empty;
}

/** Joins values with a delimiter and optional empty-value filtering. Example: TEXTJOIN(",",TRUE,"A","B") returns "A,B". */
export const TEXTJOIN: FormulaFunction = {
  name: 'TEXTJOIN',
  evaluate(args, context) {
    if (args.length < 3 || args[1]?.kind === 'missing') return valueError();
    const delimiterValue = textArg(args, 0, context);
    const delimiter =
      isFormulaErrorValue(delimiterValue) && isEmptyDelimiterRange(args[0], context) ? '' : delimiterValue;
    if (isFormulaErrorValue(delimiter)) return delimiter;
    const ignoreEmpty = booleanArg(args, 1, context, false);
    if (isFormulaErrorValue(ignoreEmpty)) return ignoreEmpty;
    const result: string[] = [];
    for (const arg of args.slice(2)) {
      const values = flattenTextArg(arg, context, ignoreEmpty);
      if (isFormulaErrorValue(values)) return values;
      result.push(...(ignoreEmpty ? values.filter(Boolean) : values));
    }
    const joined = result.join(delimiter);
    if (joined.length > 32767) return valueError();
    return joined === '' ? null : joined;
  },
};
