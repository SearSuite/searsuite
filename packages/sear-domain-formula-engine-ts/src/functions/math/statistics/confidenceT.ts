import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * CONFIDENCE.T formula.
 * Evaluates the Excel-compatible CONFIDENCE.T statistical function.
 * Example: =CONFIDENCE.T(1,2,3).
 */
export const CONFIDENCE_T = createStatisticsFunction('CONFIDENCE.T');
