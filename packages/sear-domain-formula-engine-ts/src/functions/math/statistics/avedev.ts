import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * AVEDEV formula.
 * Evaluates the Excel-compatible AVEDEV statistical function.
 * Example: =AVEDEV(1,2,3).
 */
export const AVEDEV = createStatisticsFunction('AVEDEV');
