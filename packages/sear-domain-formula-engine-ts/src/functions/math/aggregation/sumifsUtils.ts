import { type EvalContext, type FormulaValue, type ResolvedFormulaRange } from '@searsuite/sear-domain-formula-engine';
import { matchesCriteria, forEachFormulaRangeCell, readFormulaRangeCellByOffset } from '../../shared/helpers';
import { isFormulaErrorValue, rangeDimensions, sameDimensions, valueError } from '../shared/mathUtils';

export function sumIfsRanges(
  sumRange: ResolvedFormulaRange,
  criteriaRanges: ResolvedFormulaRange[],
  criteria: FormulaValue[],
  context: EvalContext,
): FormulaValue {
  const dimensions = rangeDimensions(sumRange);
  if (criteriaRanges.some((range) => !sameDimensions(dimensions, rangeDimensions(range)))) return valueError();

  let total = 0;
  let selectedError: FormulaValue | undefined;
  const error = forEachFormulaRangeCell(sumRange, context, (sumValue, rowOffset, colOffset) => {
    for (let index = 0; index < criteriaRanges.length; index++) {
      const candidate = readFormulaRangeCellByOffset(criteriaRanges[index]!, rowOffset, colOffset, context);
      if (!matchesCriteria(candidate, criteria[index]!)) return;
    }

    if (isFormulaErrorValue(sumValue)) {
      selectedError = sumValue;
      return false;
    }
    if (typeof sumValue === 'number') total += sumValue;
  });
  return error ?? selectedError ?? total;
}
