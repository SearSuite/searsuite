/**
 * CRITBINOM compatibility formula: Returns the smallest binomial value meeting a cumulative probability.
 * Example: =CRITBINOM(6,0.5,0.75)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const CRITBINOM = createCompatibilityFunction('CRITBINOM');
