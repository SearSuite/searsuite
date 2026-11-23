/**
 * POISSON compatibility formula: Returns a Poisson distribution value.
 * Example: =POISSON(2,5,TRUE)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const POISSON = createCompatibilityFunction('POISSON');
