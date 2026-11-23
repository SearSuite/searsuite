import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * VARA formula.
 * Evaluates the Excel-compatible VARA statistical function.
 * Example: =VARA(1,2,3).
 */
export const VARA = createStatisticsFunction('VARA');
