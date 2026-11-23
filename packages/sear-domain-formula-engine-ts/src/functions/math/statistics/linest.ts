import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * LINEST formula.
 * Evaluates the Excel-compatible LINEST statistical function.
 * Example: =LINEST(1,2,3).
 */
export const LINEST = createStatisticsFunction('LINEST');
