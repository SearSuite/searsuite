import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * BETA.DIST formula.
 * Evaluates the Excel-compatible BETA.DIST statistical function.
 * Example: =BETA.DIST(1,1,TRUE).
 */
export const BETA_DIST = createStatisticsFunction('BETA.DIST');
