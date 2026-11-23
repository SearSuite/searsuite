/**
 * PERCENTILE compatibility formula: Returns an inclusive percentile.
 * Example: =PERCENTILE({1,2,3,4},0.5)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const PERCENTILE = createCompatibilityFunction('PERCENTILE');
