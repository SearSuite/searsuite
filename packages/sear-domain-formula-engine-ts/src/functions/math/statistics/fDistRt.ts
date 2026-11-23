import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * F.DIST.RT formula.
 * Evaluates the Excel-compatible F.DIST.RT statistical function.
 * Example: =F.DIST.RT(1,1,TRUE).
 */
export const F_DIST_RT = createStatisticsFunction('F.DIST.RT');
