import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * RANK.AVG formula.
 * Evaluates the Excel-compatible RANK.AVG statistical function.
 * Example: =RANK.AVG(1,2,3).
 */
export const RANK_AVG = createStatisticsFunction('RANK.AVG');
