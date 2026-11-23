import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * Z.TEST formula.
 * Evaluates the Excel-compatible Z.TEST statistical function.
 * Example: =Z.TEST(1,2,3).
 */
export const Z_TEST = createStatisticsFunction('Z.TEST');
