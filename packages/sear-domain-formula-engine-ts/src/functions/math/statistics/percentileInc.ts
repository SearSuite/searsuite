import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * PERCENTILE.INC formula.
 * Evaluates the Excel-compatible PERCENTILE.INC statistical function.
 * Example: =PERCENTILE.INC(1,2,3).
 */
export const PERCENTILE_INC = createStatisticsFunction('PERCENTILE.INC');
