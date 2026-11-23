import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * QUARTILE.INC formula.
 * Evaluates the Excel-compatible QUARTILE.INC statistical function.
 * Example: =QUARTILE.INC(1,2,3).
 */
export const QUARTILE_INC = createStatisticsFunction('QUARTILE.INC');
