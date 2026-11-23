import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * FISHER formula.
 * Evaluates the Excel-compatible FISHER statistical function.
 * Example: =FISHER(1,2,3).
 */
export const FISHER = createStatisticsFunction('FISHER');
