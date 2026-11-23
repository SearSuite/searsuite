/**
 * CSCH: Returns the hyperbolic cosecant of a number.
 * Example: =CSCH(1) returns approximately 0.850918128.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { divisionError, evaluateUnaryNumeric, nameError } from '../shared/mathUtils';

export const CSCH = evaluateUnaryNumeric(
  'CSCH',
  (value) => {
    const sine = Math.sinh(value);
    return sine === 0 ? divisionError() : 1 / sine;
  },
  1,
  1,
  nameError,
  false,
) satisfies FormulaFunction;
