import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * SKEW.P formula.
 * Evaluates the Excel-compatible SKEW.P statistical function.
 * Example: =SKEW.P(1,2,3).
 */
export const SKEW_P = createStatisticsFunction('SKEW.P');
