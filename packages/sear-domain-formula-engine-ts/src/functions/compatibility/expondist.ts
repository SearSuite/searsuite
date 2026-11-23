/**
 * EXPONDIST compatibility formula: Returns an exponential distribution value.
 * Example: =EXPONDIST(0.2,10,TRUE)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const EXPONDIST = createCompatibilityFunction('EXPONDIST');
