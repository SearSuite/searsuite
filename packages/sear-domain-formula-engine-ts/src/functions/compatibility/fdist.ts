/**
 * FDIST compatibility formula: Returns the right-tailed F distribution probability.
 * Example: =FDIST(15.2069,6,4)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const FDIST = createCompatibilityFunction('FDIST');
