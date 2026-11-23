/**
 * COS: Returns the cosine of an angle in radians.
 * Example: =COS(0) returns 1.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric } from '../shared/mathUtils';
import { boundedTrig } from './boundedTrig';

export const COS = evaluateUnaryNumeric('COS', boundedTrig(Math.cos), 1, 1) satisfies FormulaFunction;
