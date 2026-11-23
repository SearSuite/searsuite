/**
 * FLOOR compatibility formula: Rounds a number down to a legacy significance multiple.
 * Example: =FLOOR(2.5,1)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const FLOOR = createCompatibilityFunction('FLOOR');
