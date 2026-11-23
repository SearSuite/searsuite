import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * CHISQ.DIST formula.
 * Evaluates the Excel-compatible CHISQ.DIST statistical function.
 * Example: =CHISQ.DIST(1,1,TRUE).
 */
export const CHISQ_DIST = createStatisticsFunction('CHISQ.DIST');
