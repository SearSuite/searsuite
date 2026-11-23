import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * CHISQ.DIST.RT formula.
 * Evaluates the Excel-compatible CHISQ.DIST.RT statistical function.
 * Example: =CHISQ.DIST.RT(1,1,TRUE).
 */
export const CHISQ_DIST_RT = createStatisticsFunction('CHISQ.DIST.RT');
