/**
 * TINV compatibility formula: Returns the inverse two-tailed Student t value.
 * Example: =TINV(0.05,10)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const TINV = createCompatibilityFunction('TINV');
