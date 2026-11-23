/**
 * ABS: Returns the absolute value of a number.
 * Example: =ABS(-2) returns 2.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric } from '../shared/mathUtils';

export const ABS = evaluateUnaryNumeric('ABS', Math.abs, 1, 1) satisfies FormulaFunction;
