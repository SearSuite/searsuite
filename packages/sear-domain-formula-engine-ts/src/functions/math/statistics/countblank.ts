import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * COUNTBLANK formula.
 * Evaluates the Excel-compatible COUNTBLANK statistical function.
 * Example: =COUNTBLANK(1,2,3).
 */
export const COUNTBLANK = createStatisticsFunction('COUNTBLANK');
