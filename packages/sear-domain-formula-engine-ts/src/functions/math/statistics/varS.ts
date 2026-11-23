import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * VAR.S formula.
 * Evaluates the Excel-compatible VAR.S statistical function.
 * Example: =VAR.S(1,2,3).
 */
export const VAR_S = createStatisticsFunction('VAR.S');
