import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * GAMMA.DIST formula.
 * Evaluates the Excel-compatible GAMMA.DIST statistical function.
 * Example: =GAMMA.DIST(1,1,TRUE).
 */
export const GAMMA_DIST = createStatisticsFunction('GAMMA.DIST');
