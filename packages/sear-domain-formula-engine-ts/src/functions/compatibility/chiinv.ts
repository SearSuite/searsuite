/**
 * CHIINV compatibility formula: Returns the inverse right-tailed chi-square value.
 * Example: =CHIINV(0.05,10)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const CHIINV = createCompatibilityFunction('CHIINV');
