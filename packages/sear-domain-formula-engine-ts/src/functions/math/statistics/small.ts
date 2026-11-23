import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * SMALL formula.
 * Evaluates the Excel-compatible SMALL statistical function.
 * Example: =SMALL(1,2,3).
 */
export const SMALL = createStatisticsFunction('SMALL');
