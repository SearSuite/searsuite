import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * WEIBULL.DIST formula.
 * Evaluates the Excel-compatible WEIBULL.DIST statistical function.
 * Example: =WEIBULL.DIST(1,1,TRUE).
 */
export const WEIBULL_DIST = createStatisticsFunction('WEIBULL.DIST');
