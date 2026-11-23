import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * BINOM.DIST formula.
 * Evaluates the Excel-compatible BINOM.DIST statistical function.
 * Example: =BINOM.DIST(1,1,TRUE).
 */
export const BINOM_DIST = createStatisticsFunction('BINOM.DIST');
