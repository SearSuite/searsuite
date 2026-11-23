import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * T.TEST formula.
 * Evaluates the Excel-compatible T.TEST statistical function.
 * Example: =T.TEST(1,2,3).
 */
export const T_TEST = createStatisticsFunction('T.TEST');
