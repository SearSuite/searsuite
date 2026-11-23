/**
 * FTEST compatibility formula: Returns the two-tailed F-test probability.
 * Example: =FTEST({1,2,3},{1,2,4})
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const FTEST = createCompatibilityFunction('FTEST');
