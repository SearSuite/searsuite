/**
 * GAMMADIST compatibility formula: Returns a gamma distribution value.
 * Example: =GAMMADIST(10,9,2,TRUE)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const GAMMADIST = createCompatibilityFunction('GAMMADIST');
