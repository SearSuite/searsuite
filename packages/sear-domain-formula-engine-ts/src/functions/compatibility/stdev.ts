/**
 * STDEV compatibility formula: Returns the sample standard deviation.
 * Example: =STDEV(1,2,3)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const STDEV = createCompatibilityFunction('STDEV');
