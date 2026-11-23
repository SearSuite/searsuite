import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * LOGNORM.DIST formula.
 * Evaluates the Excel-compatible LOGNORM.DIST statistical function.
 * Example: =LOGNORM.DIST(1,1,TRUE).
 */
export const LOGNORM_DIST = createStatisticsFunction('LOGNORM.DIST');
