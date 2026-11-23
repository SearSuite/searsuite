import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * CHISQ.TEST formula.
 * Evaluates the Excel-compatible CHISQ.TEST statistical function.
 * Example: =CHISQ.TEST(1,2,3).
 */
export const CHISQ_TEST = createStatisticsFunction('CHISQ.TEST');
