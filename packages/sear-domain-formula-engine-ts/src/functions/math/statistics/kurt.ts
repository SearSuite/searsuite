import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * KURT formula.
 * Evaluates the Excel-compatible KURT statistical function.
 * Example: =KURT(1,2,3).
 */
export const KURT = createStatisticsFunction('KURT');
