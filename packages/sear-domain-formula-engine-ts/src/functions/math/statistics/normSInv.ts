import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * NORM.S.INV formula.
 * Evaluates the Excel-compatible NORM.S.INV statistical function.
 * Example: =NORM.S.INV(0.5,1,1).
 */
export const NORM_S_INV = createStatisticsFunction('NORM.S.INV');
