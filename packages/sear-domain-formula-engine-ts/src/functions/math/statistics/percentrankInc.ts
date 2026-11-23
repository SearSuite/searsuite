import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * PERCENTRANK.INC formula.
 * Evaluates the Excel-compatible PERCENTRANK.INC statistical function.
 * Example: =PERCENTRANK.INC(1,2,3).
 */
export const PERCENTRANK_INC = createStatisticsFunction('PERCENTRANK.INC');
