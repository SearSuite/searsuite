/**
 * SIN: Returns the sine of an angle in radians.
 * Example: =SIN(0) returns 0.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric } from '../shared/mathUtils';
import { boundedTrig } from './boundedTrig';

export const SIN = evaluateUnaryNumeric('SIN', boundedTrig(Math.sin), 1, 1) satisfies FormulaFunction;
