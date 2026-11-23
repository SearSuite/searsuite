import { FormulaNodeKind } from '@searsuite/sear-domain-formula-engine';
import { parseExcelDate } from '../shared/dateTimeUtils';
import {
  dateTimeParseOptions,
  isIndirectSlashDateText,
  isFormulaErrorValue,
  makeDateFunction,
  scalarArg,
  valueError,
} from '../shared/dateTimeFunctionUtils';

/**
 * DATEVALUE: Converts date text into an Excel date serial.
 * Example: =DATEVALUE("22-MAY-2011") returns 40685.
 */
export const DATEVALUE = makeDateFunction('DATEVALUE', 1, 1, (args, context) => {
  const value = scalarArg(args, 0, context);
  if (isFormulaErrorValue(value)) return value;
  const arg = args[0];
  const directCell = arg?.kind === FormulaNodeKind.Cell || arg?.kind === FormulaNodeKind.WorkbookCell;
  if (isIndirectSlashDateText(arg, value) && !directCell) return valueError();
  const serial = parseExcelDate(value, dateTimeParseOptions(context));
  return serial ?? valueError();
});
