/**
 * NORM.INV compatibility formula: Returns an inverse normal distribution value under the NORM.INV name.
 * Example: =NORM.INV(0.908789,40,1.5)
 */
import { createCompatibilityFunction } from './CompatibilityRuntime';

export const NORM_INV = createCompatibilityFunction('NORM.INV');
