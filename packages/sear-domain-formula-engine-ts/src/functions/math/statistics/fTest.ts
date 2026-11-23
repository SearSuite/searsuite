import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * F.TEST formula.
 * Evaluates the Excel-compatible F.TEST statistical function.
 * Example: =F.TEST(1,2,3).
 */
export const F_TEST = createStatisticsFunction('F.TEST');
