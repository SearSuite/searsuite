/**
 * VARP compatibility formula: Returns the population variance.
 * Example: =VARP(1,2,3)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const VARP = createCompatibilityFunction('VARP');
