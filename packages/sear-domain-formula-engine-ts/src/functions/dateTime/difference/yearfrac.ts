import {
  actualYearFrac,
  dateSerialArg,
  days360Serial,
  isFormulaErrorValue,
  makeDateFunction,
  numberError,
  numericArg,
  serialParts,
  valueError,
} from '../shared/dateTimeFunctionUtils';
import { FormulaNodeKind } from '@searsuite/sear-domain-formula-engine';
import { isBlankScalarInput } from '../../shared/blankScalarInput';

/**
 * YEARFRAC: Returns the fraction of a year represented by two dates.
 * Example: =YEARFRAC("1/1/2012","7/30/2012",1) returns 0.5765027322404371.
 */
export const YEARFRAC = makeDateFunction('YEARFRAC', 2, 3, (args, context) => {
  const start = dateSerialArg(args, 0, context);
  const end = dateSerialArg(args, 1, context);
  const basis = args[2] === undefined || args[2].kind === 'missing' ? 0 : numericArg(args, 2, context);
  if (isFormulaErrorValue(start)) return start;
  if (isFormulaErrorValue(end)) return end;
  if (isFormulaErrorValue(basis)) return basis;
  const basisCode = Math.trunc(basis);
  if (basisCode < 0 || basisCode > 4) return numberError();
  const earlier = Math.min(start, end);
  const later = Math.max(start, end);
  if (basisCode === 0 || basisCode === 4) {
    const days = days360Serial(earlier, later, basisCode === 4);
    return isFormulaErrorValue(days) ? days : days / 360;
  }
  if (basisCode === 1) {
    if (start === 0 && args[0]?.kind === FormulaNodeKind.Cell && isBlankScalarInput(args[0], context)) {
      const endParts = serialParts(end);
      if (endParts?.month === 12 && endParts.day === 31) return endParts.year - 1899;
    }
    const result = actualYearFrac(earlier, later);
    return Number.isNaN(result) ? valueError() : result;
  }
  if (basisCode === 2) return (later - earlier) / 360;
  return (later - earlier) / 365;
});
