import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * AVERAGEA formula.
 * Evaluates the Excel-compatible AVERAGEA statistical function.
 * Example: =AVERAGEA(1,2,3).
 */
export const AVERAGEA = createStatisticsFunction('AVERAGEA');
