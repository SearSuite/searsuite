import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { parseNumberValue } from './textFormat/ExcelNumberFormat';
import { isFormulaErrorValue, optionalTextArg, textArg } from './textFormat/FormulaTextValues';
import { isBlankScalarInput } from '../shared/blankScalarInput';

/** Parses numeric text with explicit separators. Example: NUMBERVALUE("2.500,27",",",".") returns 2500.27. */
export const NUMBERVALUE: FormulaFunction = {
  name: 'NUMBERVALUE',

  evaluate(args, context) {
    const text = textArg(args, 0, context);
    if (isFormulaErrorValue(text)) return text;
    const decimalSeparator = optionalTextArg(args, 1, context, '.');
    if (isFormulaErrorValue(decimalSeparator)) return decimalSeparator;
    const groupSeparator = optionalTextArg(args, 2, context, ',');
    if (isFormulaErrorValue(groupSeparator)) return groupSeparator;
    if (args[0] && isBlankScalarInput(args[0], context)) return 0;
    if (text === '') return 0;
    return parseNumberValue(text, decimalSeparator, groupSeparator);
  },
};
