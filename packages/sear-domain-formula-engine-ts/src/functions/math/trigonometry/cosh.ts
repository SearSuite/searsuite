/**
 * COSH: Returns the hyperbolic cosine of a number.
 * Example: =COSH(0) returns 1.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric } from '../shared/mathUtils';

export const COSH = evaluateUnaryNumeric('COSH', Math.cosh, 1, 1) satisfies FormulaFunction;
