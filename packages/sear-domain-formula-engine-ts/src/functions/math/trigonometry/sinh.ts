/**
 * SINH: Returns the hyperbolic sine of a number.
 * Example: =SINH(0) returns 0.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric } from '../shared/mathUtils';

export const SINH = evaluateUnaryNumeric('SINH', Math.sinh, 1, 1) satisfies FormulaFunction;
