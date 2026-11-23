import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * NORM.S.DIST formula.
 * Evaluates the Excel-compatible NORM.S.DIST statistical function.
 * Example: =NORM.S.DIST(1,1,TRUE).
 */
export const NORM_S_DIST = createStatisticsFunction('NORM.S.DIST');
