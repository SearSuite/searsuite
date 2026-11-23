import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * COUNTIF formula.
 * Evaluates the Excel-compatible COUNTIF statistical function.
 * Example: =COUNTIF(1,2,3).
 */
export const COUNTIF = createStatisticsFunction('COUNTIF');
