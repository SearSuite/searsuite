import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * FISHERINV formula.
 * Evaluates the Excel-compatible FISHERINV statistical function.
 * Example: =FISHERINV(0.5,1,1).
 */
export const FISHERINV = createStatisticsFunction('FISHERINV');
