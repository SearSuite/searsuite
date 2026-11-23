import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * CHISQ.INV.RT formula.
 * Evaluates the Excel-compatible CHISQ.INV.RT statistical function.
 * Example: =CHISQ.INV.RT(0.5,1,1).
 */
export const CHISQ_INV_RT = createStatisticsFunction('CHISQ.INV.RT');
