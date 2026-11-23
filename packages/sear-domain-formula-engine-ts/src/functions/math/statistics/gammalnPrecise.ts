import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * GAMMALN.PRECISE formula.
 * Evaluates the Excel-compatible GAMMALN.PRECISE statistical function.
 * Example: =GAMMALN.PRECISE(1,2,3).
 */
export const GAMMALN_PRECISE = createStatisticsFunction('GAMMALN.PRECISE');
