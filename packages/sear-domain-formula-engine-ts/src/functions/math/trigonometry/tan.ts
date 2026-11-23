/**
 * TAN: Returns the tangent of an angle in radians.
 * Example: =TAN(0) returns 0.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric } from '../shared/mathUtils';
import { boundedTrig } from './boundedTrig';

export const TAN = evaluateUnaryNumeric('TAN', boundedTrig(Math.tan), 1, 1) satisfies FormulaFunction;
