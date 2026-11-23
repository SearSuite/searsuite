/**
 * INT: Rounds a number down to the nearest integer.
 * Example: =INT(-0.1) returns -1.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric } from '../shared/mathUtils';

export const INT = evaluateUnaryNumeric('INT', Math.floor, 1, 1) satisfies FormulaFunction;
