import { FormulaErrorCode, FormulaNodeKind } from '@searsuite/sear-domain-formula-engine';
import {
  dateSerialArg,
  holidaySet,
  isFormulaErrorValue,
  makeDateFunction,
  numberError,
  numericArg,
  parseWeekend,
  scalarArg,
  workday,
} from '../shared/dateTimeFunctionUtils';

/**
 * WORKDAY.INTL: Returns a workday-offset date serial with custom weekend rules.
 * Example: =WORKDAY.INTL(DATE(2012,1,1),30,17) returns 40944.
 */
export const WORKDAY_INTL = makeDateFunction('WORKDAY.INTL', 2, 4, (args, context) => {
  const literalBoolean = (index: number): boolean => args[index]?.kind === 'value' &&
    args[index].sourceKind === FormulaNodeKind.Boolean;
  const start = dateSerialArg(args, 0, context, { rejectBoolean: !literalBoolean(0) });
  const days = numericArg(args, 1, context, { rejectBoolean: !literalBoolean(1), allowDateText: true });
  const weekendValue = args[2] === undefined || args[2].kind === 'missing' ? undefined : scalarArg(args, 2, context);
  const weekend = isFormulaErrorValue(weekendValue)
    ? weekendValue.code === FormulaErrorCode.Reference || weekendValue.code === FormulaErrorCode.Name
      ? numberError()
      : weekendValue
    : parseWeekend(weekendValue);
  const holidays = holidaySet(args[3], context);
  if (isFormulaErrorValue(start)) return start;
  if (isFormulaErrorValue(days)) return days;
  if (isFormulaErrorValue(weekend)) return weekend;
  if (isFormulaErrorValue(holidays)) return holidays;
  return workday(start, Math.floor(days), weekend, holidays);
});
