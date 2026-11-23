import { FormulaNodeKind, type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, valueError } from './textFormat/FormulaTextValues';
import { flattenTextArg } from './textFunctionHelpers';

/** Legacy text concatenation. Example: CONCATENATE("Hello"," World") returns "Hello World". */
export const CONCATENATE: FormulaFunction = {
  name: 'CONCATENATE',
  evaluate(args, context) {
    if (args.length > 255) return valueError();
    let result = '';
    for (const arg of args) {
      if (
        arg.kind === FormulaNodeKind.Range ||
        arg.kind === FormulaNodeKind.WorkbookRange ||
        arg.kind === FormulaNodeKind.ColumnRange ||
        arg.kind === FormulaNodeKind.RowRange
      )
        return valueError();
      const values = flattenTextArg(arg, context);
      if (isFormulaErrorValue(values)) return values;
      result += values.join('');
      if (result.length > 8192) return valueError();
    }
    return result;
  },
};
