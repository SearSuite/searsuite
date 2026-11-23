import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * EXPON.DIST formula.
 * Evaluates the Excel-compatible EXPON.DIST statistical function.
 * Example: =EXPON.DIST(1,1,TRUE).
 */
export const EXPON_DIST = createStatisticsFunction('EXPON.DIST');
