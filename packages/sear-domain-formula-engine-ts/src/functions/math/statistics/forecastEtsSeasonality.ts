import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * FORECAST.ETS.SEASONALITY formula.
 * Evaluates the Excel-compatible FORECAST.ETS.SEASONALITY statistical function.
 * Example: =FORECAST.ETS.SEASONALITY(1,2,3).
 */
export const FORECAST_ETS_SEASONALITY = createStatisticsFunction('FORECAST.ETS.SEASONALITY');
