/**
 * FACT: Returns the factorial of a nonnegative integer.
 * Example: =FACT(5) returns 120.
 */
import { type FormulaFunction } from '@searsuite/sear-domain-formula-engine';
import { evaluateUnaryNumeric } from '../shared/mathUtils';
import { factorial } from './roundingUtils';

export const FACT = evaluateUnaryNumeric(
  'FACT',
  (value) => factorial(Math.floor(value)),
  1,
  1,
) satisfies FormulaFunction;
