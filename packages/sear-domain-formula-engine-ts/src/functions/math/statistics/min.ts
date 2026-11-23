import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * MIN formula.
 * Evaluates the Excel-compatible MIN statistical function.
 * Example: =MIN(1,2,3).
 */
export const MIN = createStatisticsFunction('MIN');
