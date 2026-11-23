/**
 * NEGBINOMDIST compatibility formula: Returns the non-cumulative negative-binomial probability.
 * Example: =NEGBINOMDIST(10,5,0.25)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const NEGBINOMDIST = createCompatibilityFunction('NEGBINOMDIST');
