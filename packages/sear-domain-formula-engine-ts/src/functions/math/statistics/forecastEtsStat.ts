import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * FORECAST.ETS.STAT formula.
 * Evaluates the Excel-compatible FORECAST.ETS.STAT statistical function.
 * Example: =FORECAST.ETS.STAT(1,2,3).
 */
export const FORECAST_ETS_STAT = createStatisticsFunction('FORECAST.ETS.STAT');
