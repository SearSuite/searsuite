import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * FORECAST.ETS formula.
 * Evaluates the Excel-compatible FORECAST.ETS statistical function.
 * Example: =FORECAST.ETS(1,2,3).
 */
export const FORECAST_ETS = createStatisticsFunction('FORECAST.ETS');
