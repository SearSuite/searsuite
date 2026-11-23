import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * GAMMALN formula.
 * Evaluates the Excel-compatible GAMMALN statistical function.
 * Example: =GAMMALN(1,2,3).
 */
export const GAMMALN = createStatisticsFunction('GAMMALN');
