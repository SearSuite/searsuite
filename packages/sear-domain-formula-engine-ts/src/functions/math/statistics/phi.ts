import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * PHI formula.
 * Evaluates the Excel-compatible PHI statistical function.
 * Example: =PHI(1,2,3).
 */
export const PHI = createStatisticsFunction('PHI');
