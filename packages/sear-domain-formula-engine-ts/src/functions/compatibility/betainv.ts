/**
 * BETAINV compatibility formula: Returns the inverse cumulative beta distribution.
 * Example: =BETAINV(0.685470581,8,10,1,3)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const BETAINV = createCompatibilityFunction('BETAINV');
