import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import {
  conciseFormulaText,
  integerArg,
  isFormulaErrorValue,
  scalarValueArg,
  strictFormulaText,
  valueError,
} from './textFormat/FormulaTextValues';

/** Converts one value to concise or strict text. Example: VALUETOTEXT("A",1) returns "\"A\"". */
export const VALUETOTEXT: FormulaFunction = {
  name: 'VALUETOTEXT',

  evaluate(args, context) {
    if (args.length < 1 || args.length > 2) return valueError();
    const value = scalarValueArg(args, 0, context);
    if (isFormulaErrorValue(value)) return value;
    const format = integerArg(args, 1, context, 0);
    if (isFormulaErrorValue(format)) return format;
    if (format !== 0 && format !== 1) return valueError();
    return format === 1 ? strictFormulaText(value) : conciseFormulaText(value);
  },
};
