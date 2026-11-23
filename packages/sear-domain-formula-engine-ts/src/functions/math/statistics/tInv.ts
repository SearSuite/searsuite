import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * T.INV formula.
 * Evaluates the Excel-compatible T.INV statistical function.
 * Example: =T.INV(0.5,1,1).
 */
export const T_INV = createStatisticsFunction('T.INV');
