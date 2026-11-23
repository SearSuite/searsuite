/**
 * LOGINV compatibility formula: Returns the inverse lognormal distribution.
 * Example: =LOGINV(0.039084,3.5,1.2)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const LOGINV = createCompatibilityFunction('LOGINV');
