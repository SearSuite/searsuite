import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * PROB formula.
 * Evaluates the Excel-compatible PROB statistical function.
 * Example: =PROB(1,2,3).
 */
export const PROB = createStatisticsFunction('PROB');
