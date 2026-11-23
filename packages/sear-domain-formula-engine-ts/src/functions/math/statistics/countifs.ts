import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * COUNTIFS formula.
 * Evaluates the Excel-compatible COUNTIFS statistical function.
 * Example: =COUNTIFS(1,2,3).
 */
export const COUNTIFS = createStatisticsFunction('COUNTIFS');
