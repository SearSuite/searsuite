import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * LARGE formula.
 * Evaluates the Excel-compatible LARGE statistical function.
 * Example: =LARGE(1,2,3).
 */
export const LARGE = createStatisticsFunction('LARGE');
