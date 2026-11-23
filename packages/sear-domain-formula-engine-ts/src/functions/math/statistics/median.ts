import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * MEDIAN formula.
 * Evaluates the Excel-compatible MEDIAN statistical function.
 * Example: =MEDIAN(1,2,3).
 */
export const MEDIAN = createStatisticsFunction('MEDIAN');
