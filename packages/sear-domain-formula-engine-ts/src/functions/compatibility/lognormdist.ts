/**
 * LOGNORMDIST compatibility formula: Returns the cumulative lognormal distribution.
 * Example: =LOGNORMDIST(4,3.5,1.2)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const LOGNORMDIST = createCompatibilityFunction('LOGNORMDIST');
