import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * STDEV.P formula.
 * Evaluates the Excel-compatible STDEV.P statistical function.
 * Example: =STDEV.P(1,2,3).
 */
export const STDEV_P = createStatisticsFunction('STDEV.P');
