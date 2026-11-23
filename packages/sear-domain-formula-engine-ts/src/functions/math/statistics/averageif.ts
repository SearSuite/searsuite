import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * AVERAGEIF formula.
 * Evaluates the Excel-compatible AVERAGEIF statistical function.
 * Example: =AVERAGEIF(1,2,3).
 */
export const AVERAGEIF = createStatisticsFunction('AVERAGEIF');
