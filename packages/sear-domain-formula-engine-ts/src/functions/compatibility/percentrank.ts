/**
 * PERCENTRANK compatibility formula: Returns an inclusive percentage rank.
 * Example: =PERCENTRANK({1,2,3,4},3)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const PERCENTRANK = createCompatibilityFunction('PERCENTRANK');
