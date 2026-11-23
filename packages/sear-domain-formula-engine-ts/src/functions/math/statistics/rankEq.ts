import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * RANK.EQ formula.
 * Evaluates the Excel-compatible RANK.EQ statistical function.
 * Example: =RANK.EQ(1,2,3).
 */
export const RANK_EQ = createStatisticsFunction('RANK.EQ');
