import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * MAXIFS formula.
 * Evaluates the Excel-compatible MAXIFS statistical function.
 * Example: =MAXIFS(1,2,3).
 */
export const MAXIFS = createStatisticsFunction('MAXIFS');
