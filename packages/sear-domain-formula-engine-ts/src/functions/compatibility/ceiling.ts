/**
 * CEILING compatibility formula: Rounds a number up to a legacy significance multiple.
 * Example: =CEILING(2.5,1)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const CEILING = createCompatibilityFunction('CEILING');
