import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * FORECAST.ETS.CONFINT formula.
 * Evaluates the Excel-compatible FORECAST.ETS.CONFINT statistical function.
 * Example: =FORECAST.ETS.CONFINT(1,2,3).
 */
export const FORECAST_ETS_CONFINT = createStatisticsFunction('FORECAST.ETS.CONFINT');
