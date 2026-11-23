import { isFormulaArgumentKind } from '@searsuite/sear-domain-formula-engine';
import { makeDateFunction, numericArg, isFormulaErrorValue, valueError } from '../shared/dateTimeFunctionUtils';

/** EPOCHTODATE converts a Unix timestamp to an Excel UTC date-time serial. Example: =EPOCHTODATE(0) returns 25569. */
export const EPOCHTODATE = makeDateFunction('EPOCHTODATE', 1, 2, (args, context) => {
  const timestamp = numericArg(args, 0, context);
  const unit = !args[1] || isFormulaArgumentKind(args[1], 'missing') ? 1 : numericArg(args, 1, context);
  if (isFormulaErrorValue(timestamp)) return timestamp;
  if (isFormulaErrorValue(unit)) return unit;
  const divisor = unit === 1 ? 1 : unit === 2 ? 1_000 : unit === 3 ? 1_000_000 : 0;
  return divisor ? 25_569 + timestamp / divisor / 86_400 : valueError();
});
