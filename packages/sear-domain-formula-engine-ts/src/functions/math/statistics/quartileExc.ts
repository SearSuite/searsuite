import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * QUARTILE.EXC formula.
 * Evaluates the Excel-compatible QUARTILE.EXC statistical function.
 * Example: =QUARTILE.EXC(1,2,3).
 */
export const QUARTILE_EXC = createStatisticsFunction('QUARTILE.EXC');
