/**
 * QUARTILE compatibility formula: Returns an inclusive quartile.
 * Example: =QUARTILE({1,2,3,4,5},1)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const QUARTILE = createCompatibilityFunction('QUARTILE');
