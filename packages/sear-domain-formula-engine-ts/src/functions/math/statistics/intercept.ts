import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * INTERCEPT formula.
 * Evaluates the Excel-compatible INTERCEPT statistical function.
 * Example: =INTERCEPT(1,2,3).
 */
export const INTERCEPT = createStatisticsFunction('INTERCEPT');
