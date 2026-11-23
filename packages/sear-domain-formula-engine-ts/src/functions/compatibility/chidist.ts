/**
 * CHIDIST compatibility formula: Returns the right-tailed chi-square probability.
 * Example: =CHIDIST(18.307,10)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const CHIDIST = createCompatibilityFunction('CHIDIST');
