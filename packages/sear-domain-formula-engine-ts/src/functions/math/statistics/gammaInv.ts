import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * GAMMA.INV formula.
 * Evaluates the Excel-compatible GAMMA.INV statistical function.
 * Example: =GAMMA.INV(0.5,1,1).
 */
export const GAMMA_INV = createStatisticsFunction('GAMMA.INV');
