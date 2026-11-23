import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * T.DIST.2T formula.
 * Evaluates the Excel-compatible T.DIST.2T statistical function.
 * Example: =T.DIST.2T(1,1,TRUE).
 */
export const T_DIST_2T = createStatisticsFunction('T.DIST.2T');
