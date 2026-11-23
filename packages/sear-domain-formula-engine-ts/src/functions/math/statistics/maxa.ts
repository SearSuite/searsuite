import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * MAXA formula.
 * Evaluates the Excel-compatible MAXA statistical function.
 * Example: =MAXA(1,2,3).
 */
export const MAXA = createStatisticsFunction('MAXA');
