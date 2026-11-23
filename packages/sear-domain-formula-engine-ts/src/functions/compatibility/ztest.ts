/**
 * ZTEST compatibility formula: Returns the one-tailed z-test probability.
 * Example: =ZTEST({3,6,7,8},4)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const ZTEST = createCompatibilityFunction('ZTEST');
