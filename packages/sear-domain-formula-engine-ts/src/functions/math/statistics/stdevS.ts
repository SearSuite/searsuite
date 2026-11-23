import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * STDEV.S formula.
 * Evaluates the Excel-compatible STDEV.S statistical function.
 * Example: =STDEV.S(1,2,3).
 */
export const STDEV_S = createStatisticsFunction('STDEV.S');
