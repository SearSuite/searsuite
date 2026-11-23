import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * DEVSQ formula.
 * Evaluates the Excel-compatible DEVSQ statistical function.
 * Example: =DEVSQ(1,2,3).
 */
export const DEVSQ = createStatisticsFunction('DEVSQ');
