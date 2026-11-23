import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * MAX formula.
 * Evaluates the Excel-compatible MAX statistical function.
 * Example: =MAX(1,2,3).
 */
export const MAX = createStatisticsFunction('MAX');
