import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * FREQUENCY formula.
 * Evaluates the Excel-compatible FREQUENCY statistical function.
 * Example: =FREQUENCY(1,2,3).
 */
export const FREQUENCY = createStatisticsFunction('FREQUENCY');
