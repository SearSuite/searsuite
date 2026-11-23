/**
 * BINOMDIST compatibility formula: Returns a binomial probability using the legacy function name.
 * Example: =BINOMDIST(6,10,0.5,FALSE)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const BINOMDIST = createCompatibilityFunction('BINOMDIST');
