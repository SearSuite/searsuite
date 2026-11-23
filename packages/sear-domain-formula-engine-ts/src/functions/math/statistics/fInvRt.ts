import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * F.INV.RT formula.
 * Evaluates the Excel-compatible F.INV.RT statistical function.
 * Example: =F.INV.RT(0.5,1,1).
 */
export const F_INV_RT = createStatisticsFunction('F.INV.RT');
