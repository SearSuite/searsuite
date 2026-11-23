import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * NORM.DIST formula.
 * Evaluates the Excel-compatible NORM.DIST statistical function.
 * Example: =NORM.DIST(1,1,TRUE).
 */
export const NORM_DIST = createStatisticsFunction('NORM.DIST');
