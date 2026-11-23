import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * VAR.P formula.
 * Evaluates the Excel-compatible VAR.P statistical function.
 * Example: =VAR.P(1,2,3).
 */
export const VAR_P = createStatisticsFunction('VAR.P');
