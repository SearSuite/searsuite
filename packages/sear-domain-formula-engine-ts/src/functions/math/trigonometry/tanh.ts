/**
 * TANH: Returns the hyperbolic tangent of a number.
 * Example: =TANH(0) returns 0.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric } from '../shared/mathUtils';

export const TANH = evaluateUnaryNumeric('TANH', Math.tanh, 1, 1) satisfies FormulaFunction;
