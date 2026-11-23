import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * PERMUT formula.
 * Evaluates the Excel-compatible PERMUT statistical function.
 * Example: =PERMUT(1,2,3).
 */
export const PERMUT = createStatisticsFunction('PERMUT');
