import {
  dateSerialArg,
  days360Serial,
  isFormulaErrorValue,
  makeDateFunction,
  scalarArg,
  valueError,
} from '../shared/dateTimeFunctionUtils';
import { isFormulaText } from '@searsuite/sear-foundation-utils';

/**
 * DAYS360: Returns the day difference using a 360-day accounting year.
 * Example: =DAYS360("2011-1-1","2011-12-31") returns 360.
 */
export const DAYS360 = makeDateFunction('DAYS360', 2, 3, (args, context) => {
  const start = dateSerialArg(args, 0, context);
  const end = dateSerialArg(args, 1, context);
  if (isFormulaErrorValue(start)) return start;
  if (isFormulaErrorValue(end)) return end;
  const methodValue = args[2] === undefined || args[2].kind === 'missing' ? false : scalarArg(args, 2, context);
  if (isFormulaErrorValue(methodValue)) return methodValue;
  const methodNumber = Number(isFormulaText(methodValue) ? methodValue.value : methodValue);
  if (!Number.isFinite(methodNumber)) return valueError();
  return days360Serial(start, end, methodNumber !== 0);
});
