import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * CONFIDENCE.NORM formula.
 * Evaluates the Excel-compatible CONFIDENCE.NORM statistical function.
 * Example: =CONFIDENCE.NORM(1,2,3).
 */
export const CONFIDENCE_NORM = createStatisticsFunction('CONFIDENCE.NORM');
