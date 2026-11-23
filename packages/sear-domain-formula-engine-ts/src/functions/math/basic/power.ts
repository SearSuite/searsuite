/**
 * POWER: Raises a number to a specified power.
 * Example: =POWER(2,0) returns 1.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { excelPower } from '../../../excelPower';
import { evaluateBinaryNumeric } from '../shared/mathUtils';

export const POWER = evaluateBinaryNumeric('POWER', excelPower) satisfies FormulaFunction;
