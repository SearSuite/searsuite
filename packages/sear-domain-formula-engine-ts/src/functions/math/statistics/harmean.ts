import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * HARMEAN formula.
 * Evaluates the Excel-compatible HARMEAN statistical function.
 * Example: =HARMEAN(1,2,3).
 */
export const HARMEAN = createStatisticsFunction('HARMEAN');
