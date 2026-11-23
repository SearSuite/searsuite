/**
 * STDEVP compatibility formula: Returns the population standard deviation.
 * Example: =STDEVP(1,2,3)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const STDEVP = createCompatibilityFunction('STDEVP');
