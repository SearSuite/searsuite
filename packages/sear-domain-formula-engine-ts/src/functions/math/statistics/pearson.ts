import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * PEARSON formula.
 * Evaluates the Excel-compatible PEARSON statistical function.
 * Example: =PEARSON(1,2,3).
 */
export const PEARSON = createStatisticsFunction('PEARSON');
