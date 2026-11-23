import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * COVARIANCE.S formula.
 * Evaluates the Excel-compatible COVARIANCE.S statistical function.
 * Example: =COVARIANCE.S({1,2,3},{2,3,4}).
 */
export const COVARIANCE_S = createStatisticsFunction('COVARIANCE.S');
