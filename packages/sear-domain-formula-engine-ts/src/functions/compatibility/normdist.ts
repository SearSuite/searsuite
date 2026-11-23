/**
 * NORMDIST compatibility formula: Returns a normal distribution value.
 * Example: =NORMDIST(42,40,1.5,TRUE)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const NORMDIST = createCompatibilityFunction('NORMDIST');
