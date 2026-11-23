/**
 * GAMMAINV compatibility formula: Returns an inverse gamma distribution value.
 * Example: =GAMMAINV(0.068094,9,2)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const GAMMAINV = createCompatibilityFunction('GAMMAINV');
