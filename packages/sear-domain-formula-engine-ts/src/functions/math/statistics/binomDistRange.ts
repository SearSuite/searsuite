import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * BINOM.DIST.RANGE formula.
 * Evaluates the Excel-compatible BINOM.DIST.RANGE statistical function.
 * Example: =BINOM.DIST.RANGE(1,1,TRUE).
 */
export const BINOM_DIST_RANGE = createStatisticsFunction('BINOM.DIST.RANGE');
