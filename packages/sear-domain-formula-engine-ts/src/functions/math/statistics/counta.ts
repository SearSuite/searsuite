import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * COUNTA formula.
 * Evaluates the Excel-compatible COUNTA statistical function.
 * Example: =COUNTA(1,2,3).
 */
export const COUNTA = createStatisticsFunction('COUNTA');
