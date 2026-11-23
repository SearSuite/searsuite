import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * LOGEST formula.
 * Evaluates the Excel-compatible LOGEST statistical function.
 * Example: =LOGEST(1,2,3).
 */
export const LOGEST = createStatisticsFunction('LOGEST');
