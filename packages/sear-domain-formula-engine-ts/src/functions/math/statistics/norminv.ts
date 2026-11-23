import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * NORMINV formula.
 * Evaluates the Excel-compatible NORMINV statistical function.
 * Example: =NORMINV(0.5,1,1).
 */
export const NORMINV = createStatisticsFunction('NORMINV');
