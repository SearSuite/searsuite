/**
 * CHITEST compatibility formula: Returns the chi-square independence test probability.
 * Example: =CHITEST({58,35;11,25},{45,48;24,22})
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const CHITEST = createCompatibilityFunction('CHITEST');
