import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * CHISQ.INV formula.
 * Evaluates the Excel-compatible CHISQ.INV statistical function.
 * Example: =CHISQ.INV(0.5,1,1).
 */
export const CHISQ_INV = createStatisticsFunction('CHISQ.INV');
