/**
 * CSC: Returns the cosecant of an angle in radians.
 * Example: =CSC(PI()/2) returns 1.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { divisionError, evaluateUnaryNumeric, nameError } from '../shared/mathUtils';

export const CSC = evaluateUnaryNumeric(
  'CSC',
  (value) => {
    const sine = Math.sin(value);
    return sine === 0 ? divisionError() : 1 / sine;
  },
  1,
  1,
  nameError,
  false,
) satisfies FormulaFunction;
