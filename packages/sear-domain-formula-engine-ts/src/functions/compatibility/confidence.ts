/**
 * CONFIDENCE compatibility formula: Returns a normal-distribution confidence interval.
 * Example: =CONFIDENCE(0.05,2.5,50)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const CONFIDENCE = createCompatibilityFunction('CONFIDENCE');
