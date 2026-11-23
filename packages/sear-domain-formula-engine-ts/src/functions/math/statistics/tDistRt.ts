import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * T.DIST.RT formula.
 * Evaluates the Excel-compatible T.DIST.RT statistical function.
 * Example: =T.DIST.RT(1,1,TRUE).
 */
export const T_DIST_RT = createStatisticsFunction('T.DIST.RT');
