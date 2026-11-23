/**
 * WEIBULL compatibility formula: Returns a Weibull distribution value.
 * Example: =WEIBULL(105,20,100,TRUE)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const WEIBULL = createCompatibilityFunction('WEIBULL');
