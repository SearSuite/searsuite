import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * FORECAST.LINEAR formula.
 * Evaluates the Excel-compatible FORECAST.LINEAR statistical function.
 * Example: =FORECAST.LINEAR(1,2,3).
 */
export const FORECAST_LINEAR = createStatisticsFunction('FORECAST.LINEAR');
