import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * SKEW formula.
 * Evaluates the Excel-compatible SKEW statistical function.
 * Example: =SKEW(1,2,3).
 */
export const SKEW = createStatisticsFunction('SKEW');
