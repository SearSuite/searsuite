import { FormulaErrorCode } from '@searsuite/sear-domain-formula-engine';
import {
  dateSerialArg,
  holidaySet,
  isFormulaErrorValue,
  makeDateFunction,
  networkDays,
  parseWeekend,
  scalarArg,
  valueError,
} from '../shared/dateTimeFunctionUtils';

/**
 * NETWORKDAYS.INTL: Counts workdays between dates with custom weekend rules.
 * Example: =NETWORKDAYS.INTL(DATE(2006,1,1),DATE(2006,2,1),"0010001",{"2006/1/2","2006/1/16"}) returns 20.
 */
export const NETWORKDAYS_INTL = makeDateFunction('NETWORKDAYS.INTL', 2, 4, (args, context) => {
  const start = dateSerialArg(args, 0, context, { rejectBoolean: true });
  const end = dateSerialArg(args, 1, context, { rejectBoolean: true });
  const weekendValue = args[2] === undefined || args[2].kind === 'missing' ? undefined : scalarArg(args, 2, context);
  const weekend = isFormulaErrorValue(weekendValue)
    ? weekendValue.code === FormulaErrorCode.Reference || weekendValue.code === FormulaErrorCode.Name ||
      weekendValue.code === FormulaErrorCode.Number
      ? valueError()
      : weekendValue
    : parseWeekend(weekendValue);
  const holidays = holidaySet(args[3], context);
  if (isFormulaErrorValue(start)) return start;
  if (isFormulaErrorValue(end)) return end;
  if (isFormulaErrorValue(weekend)) return weekend;
  if (isFormulaErrorValue(holidays)) return holidays;
  return networkDays(start, end, weekend, holidays);
});
