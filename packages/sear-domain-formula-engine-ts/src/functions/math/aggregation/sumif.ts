/**
 * SUMIF: Adds values that satisfy one condition.
 * Example: =SUMIF({1,2,3},">1",{10,20,30}) returns 50.
 */
import {
  type FormulaFunction,
  type FormulaArg,
  type FormulaValue,
  type EvalContext,
  FormulaErrorCode,
  createFormulaError,
  FormulaNodeKind,
} from '@searsuite/sear-domain-formula-engine';
import {
  matchesCriteria,
  readArg,
  forEachFormulaRangeCellWithMetadata,
  readFormulaRangeCellByOffset,
} from '../../shared/helpers';
import { isFormulaErrorValue, matrixDimensions, matrixFromArg, numericOrZero } from '../shared/mathUtils';
import { resolveConditionalReference } from '../../shared/conditionalReference';

export const SUMIF: FormulaFunction = {
  name: 'SUMIF',
  evaluate(args: FormulaArg[], context: EvalContext): FormulaValue {
    if (args.length < 2 || args.length > 3) return createFormulaError(FormulaErrorCode.Value);
    const criteriaRange = resolveConditionalReference(args[0], context);
    const criteria = readArg(args[1], context);
    if (isFormulaErrorValue(criteria)) {
      const reference = resolveConditionalReference(args[1], context);
      if (!reference || isFormulaErrorValue(reference)) return criteria;
    }
    if (Array.isArray(criteria)) return createFormulaError(FormulaErrorCode.Value);
    if (isFormulaErrorValue(criteriaRange)) return criteriaRange;

    if (!criteriaRange) {
      const criteriaMatrix = matrixFromArg(args[0], context);
      if (isFormulaErrorValue(criteriaMatrix)) return criteriaMatrix;
      const criteriaDimensions = matrixDimensions(criteriaMatrix);
      if (isFormulaErrorValue(criteriaDimensions)) return criteriaDimensions;

      const sumMatrix = args[2] === undefined ? criteriaMatrix : matrixFromArg(args[2], context);
      if (isFormulaErrorValue(sumMatrix)) return sumMatrix;
      const sumDimensions = matrixDimensions(sumMatrix);
      if (
        isFormulaErrorValue(sumDimensions) ||
        sumDimensions[0] !== criteriaDimensions[0] ||
        sumDimensions[1] !== criteriaDimensions[1]
      ) {
        return createFormulaError(FormulaErrorCode.Value);
      }

      let total = 0;
      for (let row = 0; row < criteriaDimensions[0]; row++) {
        for (let col = 0; col < criteriaDimensions[1]; col++) {
          if (matchesCriteria(criteriaMatrix[row]![col]!, criteria)) {
            const selected = sumMatrix[row]![col]!;
            if (isFormulaErrorValue(selected)) return selected;
            total += numericOrZero(selected);
          }
        }
      }
      return total;
    }

    let sumRange = criteriaRange;
    if (args[2] !== undefined) {
      const resolved = resolveConditionalReference(args[2], context);
      if (isFormulaErrorValue(resolved)) return resolved;
      if (!resolved) return createFormulaError(FormulaErrorCode.Value);
      sumRange = resolved;
    }
    let total = 0;
    let selectedError: FormulaValue | undefined;
    const error = forEachFormulaRangeCellWithMetadata(criteriaRange, context, (cell, rowOffset, colOffset) => {
      if (!matchesCriteria(cell.value, criteria, cell.source)) return;
      const selected = readFormulaRangeCellByOffset(sumRange, rowOffset, colOffset, context);
      if (isFormulaErrorValue(selected)) {
        selectedError = selected;
        return false;
      }
      if (typeof selected === 'number') total += selected;
    });
    if (error) return error;
    return selectedError ?? total;
  },
};
