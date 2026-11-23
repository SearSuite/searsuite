import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * SLOPE formula.
 * Evaluates the Excel-compatible SLOPE statistical function.
 * Example: =SLOPE(1,2,3).
 */
export const SLOPE = createStatisticsFunction('SLOPE');
