import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * RSQ formula.
 * Evaluates the Excel-compatible RSQ statistical function.
 * Example: =RSQ(1,2,3).
 */
export const RSQ = createStatisticsFunction('RSQ');
