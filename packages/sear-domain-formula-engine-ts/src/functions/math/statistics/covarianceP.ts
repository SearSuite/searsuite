import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * COVARIANCE.P formula.
 * Evaluates the Excel-compatible COVARIANCE.P statistical function.
 * Example: =COVARIANCE.P({1,2,3},{2,3,4}).
 */
export const COVARIANCE_P = createStatisticsFunction('COVARIANCE.P');
