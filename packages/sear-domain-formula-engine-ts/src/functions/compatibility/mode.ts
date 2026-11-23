/**
 * MODE compatibility formula: Returns the most frequent numeric value.
 * Example: =MODE(1,1,2,3)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const MODE = createCompatibilityFunction('MODE');
