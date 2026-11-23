/**
 * BETADIST compatibility formula: Returns the cumulative beta distribution using the legacy signature.
 * Example: =BETADIST(2,8,10,1,3)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const BETADIST = createCompatibilityFunction('BETADIST');
