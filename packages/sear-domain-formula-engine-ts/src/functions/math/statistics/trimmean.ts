import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * TRIMMEAN formula.
 * Evaluates the Excel-compatible TRIMMEAN statistical function.
 * Example: =TRIMMEAN(1,2,3).
 */
export const TRIMMEAN = createStatisticsFunction('TRIMMEAN');
