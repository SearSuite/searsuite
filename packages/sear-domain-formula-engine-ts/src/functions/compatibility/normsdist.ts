/**
 * NORMSDIST compatibility formula: Returns the cumulative standard normal distribution.
 * Example: =NORMSDIST(1.333333)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const NORMSDIST = createCompatibilityFunction('NORMSDIST');
