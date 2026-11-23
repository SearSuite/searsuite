/**
 * HYPGEOMDIST compatibility formula: Returns the non-cumulative hypergeometric probability.
 * Example: =HYPGEOMDIST(1,4,8,20)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const HYPGEOMDIST = createCompatibilityFunction('HYPGEOMDIST');
