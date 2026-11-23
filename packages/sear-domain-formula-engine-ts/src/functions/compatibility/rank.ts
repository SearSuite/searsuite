/**
 * RANK compatibility formula: Returns the rank of a number in a list.
 * Example: =RANK(3,{1,2,3,4},0)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const RANK = createCompatibilityFunction('RANK');
