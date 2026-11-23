import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * F.INV formula.
 * Evaluates the Excel-compatible F.INV statistical function.
 * Example: =F.INV(0.5,1,1).
 */
export const F_INV = createStatisticsFunction('F.INV');
