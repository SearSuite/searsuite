import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * GAUSS formula.
 * Evaluates the Excel-compatible GAUSS statistical function.
 * Example: =GAUSS(1,2,3).
 */
export const GAUSS = createStatisticsFunction('GAUSS');
