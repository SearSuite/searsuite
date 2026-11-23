/**
 * SECH: Returns the hyperbolic secant of a number.
 * Example: =SECH(0) returns 1.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric, nameError } from '../shared/mathUtils';

export const SECH = evaluateUnaryNumeric('SECH', (value) => 1 / Math.cosh(value), 1, 1, nameError, false) satisfies FormulaFunction;
