/**
 * TDIST compatibility formula: Returns a one- or two-tailed Student t probability.
 * Example: =TDIST(1.96,60,2)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const TDIST = createCompatibilityFunction('TDIST');
