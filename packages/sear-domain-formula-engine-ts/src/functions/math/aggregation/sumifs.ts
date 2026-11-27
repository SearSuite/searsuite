/** Sums values whose corresponding ranges satisfy every criterion. */
import {
  type FormulaFunction,
  type FormulaValue,
  type ResolvedFormulaRange,
} from '@searsuite/sear-domain-formula-engine';
import { isFormulaErrorValue, matrixDimensions, matrixFromArg, sameDimensions, valueError } from '../shared/mathUtils';
import { matchesCriteria, readArg } from '../../shared/helpers';
import { resolveConditionalReference } from '../../shared/conditionalReference';
import { sumIfsRanges } from './sumifsUtils';

export const SUMIFS: FormulaFunction = {
  name: 'SUMIFS',
  evaluate(args, context): FormulaValue {
    if (args.length < 3 || args.length % 2 === 0) return valueError();

    const sumRange = resolveConditionalReference(args[0]!, context);
    const criteriaRanges = args.slice(1).filter((_, index) => index % 2 === 0);
    const criteriaArgs = args.slice(1).filter((_, index) => index % 2 === 1);
    const criteriaValues: FormulaValue[] = [];
    for (const criteriaArg of criteriaArgs) {
      const criteria = readArg(criteriaArg, context);
      if (isFormulaErrorValue(criteria)) {
        const reference = resolveConditionalReference(criteriaArg, context);
        if (!reference || isFormulaErrorValue(reference)) return criteria;
      }
      if (Array.isArray(criteria)) return valueError();
      criteriaValues.push(criteria);
    }

    if (sumRange && !isFormulaErrorValue(sumRange) && !('kind' in sumRange)) {
      const resolvedCriteria: ResolvedFormulaRange[] = [];
      for (const criteriaArg of criteriaRanges) {
        const range = resolveConditionalReference(criteriaArg, context);
        if (isFormulaErrorValue(range)) return range;
        if (!range) {
          const unresolved = readArg(criteriaArg, context);
          return isFormulaErrorValue(unresolved) ? unresolved : valueError();
        }
        resolvedCriteria.push(range);
      }
      return sumIfsRanges(sumRange, resolvedCriteria, criteriaValues, context);
    }

    const sumMatrix = matrixFromArg(args[0]!, context);
    if (isFormulaErrorValue(sumMatrix)) return sumMatrix;
    const sumDimensions = matrixDimensions(sumMatrix);
    if (isFormulaErrorValue(sumDimensions)) return sumDimensions;

    const criteriaMatrices: FormulaValue[][][] = [];
    for (const criteriaArg of criteriaRanges) {
      const matrix = matrixFromArg(criteriaArg, context);
      if (isFormulaErrorValue(matrix)) return matrix;
      const dimensions = matrixDimensions(matrix);
      if (isFormulaErrorValue(dimensions) || !sameDimensions(sumDimensions, dimensions)) return valueError();
      criteriaMatrices.push(matrix);
    }

    let total = 0;
    for (let row = 0; row < sumDimensions[0]; row++) {
      for (let column = 0; column < sumDimensions[1]; column++) {
        let matches = true;
        for (let index = 0; index < criteriaMatrices.length; index++) {
          const candidate = criteriaMatrices[index]![row]![column]!;
          if (!matchesCriteria(candidate, criteriaValues[index]!)) {
            matches = false;
            break;
          }
        }
        const sumValue = sumMatrix[row]![column]!;
        if (matches && typeof sumValue === 'number') total += sumValue;
      }
    }
    return total;
  },
};
