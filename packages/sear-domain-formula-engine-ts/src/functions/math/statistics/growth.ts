import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * GROWTH formula.
 * Evaluates the Excel-compatible GROWTH statistical function.
 * Example: =GROWTH(1,2,3).
 */
export const GROWTH = createStatisticsFunction('GROWTH');
