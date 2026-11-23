import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * FORECAST formula.
 * Evaluates the Excel-compatible FORECAST statistical function.
 * Example: =FORECAST(1,2,3).
 */
export const FORECAST = createStatisticsFunction('FORECAST');
