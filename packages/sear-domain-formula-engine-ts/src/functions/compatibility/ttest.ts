/**
 * TTEST compatibility formula: Returns a Student t-test probability.
 * Example: =TTEST({1,2,3},{1,2,4},2,1)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const TTEST = createCompatibilityFunction('TTEST');
