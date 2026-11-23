import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * STDEVPA formula.
 * Evaluates the Excel-compatible STDEVPA statistical function.
 * Example: =STDEVPA(1,2,3).
 */
export const STDEVPA = createStatisticsFunction('STDEVPA');
