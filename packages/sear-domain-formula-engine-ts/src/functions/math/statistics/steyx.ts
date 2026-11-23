import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * STEYX formula.
 * Evaluates the Excel-compatible STEYX statistical function.
 * Example: =STEYX(1,2,3).
 */
export const STEYX = createStatisticsFunction('STEYX');
