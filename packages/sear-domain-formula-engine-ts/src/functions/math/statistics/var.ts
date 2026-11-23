import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * VAR formula.
 * Estimates sample variance for compatibility with legacy Excel workbooks.
 * Example: =VAR(1,2,3).
 */
export const VAR = createStatisticsFunction('VAR');
