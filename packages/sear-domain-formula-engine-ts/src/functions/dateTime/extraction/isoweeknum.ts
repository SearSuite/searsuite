import { FormulaErrorCode, createFormulaError } from '@searsuite/sear-domain-formula-engine';
import { dateSerialArg, isoWeek, isFormulaErrorValue, makeDateFunction } from '../shared/dateTimeFunctionUtils';

/**
 * ISOWEEKNUM: Returns the ISO 8601 week number for a date.
 * Example: =ISOWEEKNUM("2012-3-9") returns 10.
 */
export const ISOWEEKNUM = makeDateFunction('ISOWEEKNUM', 1, 1, (args, context) => {
  const serial = dateSerialArg(args, 0, context);
  return isFormulaErrorValue(serial) ? serial : isoWeek(serial);
}, false, () => createFormulaError(FormulaErrorCode.Name));
