/**
 * ATAN: Returns the arctangent of a number in radians.
 * Example: =ATAN(0) returns 0.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric } from '../shared/mathUtils';

export const ATAN = evaluateUnaryNumeric('ATAN', Math.atan, 1, 1) satisfies FormulaFunction;
