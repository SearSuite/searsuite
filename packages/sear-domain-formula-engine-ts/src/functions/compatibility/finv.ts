/**
 * FINV compatibility formula: Returns the inverse right-tailed F distribution.
 * Example: =FINV(0.01,6,4)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const FINV = createCompatibilityFunction('FINV');
