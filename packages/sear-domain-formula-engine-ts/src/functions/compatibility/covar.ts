/**
 * COVAR compatibility formula: Returns population covariance for two data sets.
 * Example: =COVAR({2,4,8},{5,11,12})
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const COVAR = createCompatibilityFunction('COVAR');
