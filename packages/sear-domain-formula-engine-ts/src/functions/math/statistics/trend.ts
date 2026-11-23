import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * TREND formula.
 * Evaluates the Excel-compatible TREND statistical function.
 * Example: =TREND(1,2,3).
 */
export const TREND = createStatisticsFunction('TREND');
