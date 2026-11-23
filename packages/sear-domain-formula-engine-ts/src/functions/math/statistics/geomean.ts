import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * GEOMEAN formula.
 * Evaluates the Excel-compatible GEOMEAN statistical function.
 * Example: =GEOMEAN(1,2,3).
 */
export const GEOMEAN = createStatisticsFunction('GEOMEAN');
