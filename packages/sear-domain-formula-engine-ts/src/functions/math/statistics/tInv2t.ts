import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * T.INV.2T formula.
 * Evaluates the Excel-compatible T.INV.2T statistical function.
 * Example: =T.INV.2T(0.5,1,1).
 */
export const T_INV_2T = createStatisticsFunction('T.INV.2T');
