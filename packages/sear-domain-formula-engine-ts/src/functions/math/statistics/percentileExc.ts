import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * PERCENTILE.EXC formula.
 * Evaluates the Excel-compatible PERCENTILE.EXC statistical function.
 * Example: =PERCENTILE.EXC(1,2,3).
 */
export const PERCENTILE_EXC = createStatisticsFunction('PERCENTILE.EXC');
