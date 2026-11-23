import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * PERCENTRANK.EXC formula.
 * Evaluates the Excel-compatible PERCENTRANK.EXC statistical function.
 * Example: =PERCENTRANK.EXC(1,2,3).
 */
export const PERCENTRANK_EXC = createStatisticsFunction('PERCENTRANK.EXC');
