import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * POISSON.DIST formula.
 * Evaluates the Excel-compatible POISSON.DIST statistical function.
 * Example: =POISSON.DIST(1,1,TRUE).
 */
export const POISSON_DIST = createStatisticsFunction('POISSON.DIST');
