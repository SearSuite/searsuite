import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * F.DIST formula.
 * Evaluates the Excel-compatible F.DIST statistical function.
 * Example: =F.DIST(1,1,TRUE).
 */
export const F_DIST = createStatisticsFunction('F.DIST');
