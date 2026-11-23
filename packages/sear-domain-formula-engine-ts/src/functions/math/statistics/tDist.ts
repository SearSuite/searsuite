import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * T.DIST formula.
 * Evaluates the Excel-compatible T.DIST statistical function.
 * Example: =T.DIST(1,1,TRUE).
 */
export const T_DIST = createStatisticsFunction('T.DIST');
