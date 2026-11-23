import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * NEGBINOM.DIST formula.
 * Evaluates the Excel-compatible NEGBINOM.DIST statistical function.
 * Example: =NEGBINOM.DIST(1,1,TRUE).
 */
export const NEGBINOM_DIST = createStatisticsFunction('NEGBINOM.DIST');
