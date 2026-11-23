import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * STANDARDIZE formula.
 * Evaluates the Excel-compatible STANDARDIZE statistical function.
 * Example: =STANDARDIZE(1,2,3).
 */
export const STANDARDIZE = createStatisticsFunction('STANDARDIZE');
