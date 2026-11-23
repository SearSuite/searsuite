import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * MINIFS formula.
 * Evaluates the Excel-compatible MINIFS statistical function.
 * Example: =MINIFS(1,2,3).
 */
export const MINIFS = createStatisticsFunction('MINIFS');
