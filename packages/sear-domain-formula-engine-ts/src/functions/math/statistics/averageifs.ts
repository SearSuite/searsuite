import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * AVERAGEIFS formula.
 * Evaluates the Excel-compatible AVERAGEIFS statistical function.
 * Example: =AVERAGEIFS(1,2,3).
 */
export const AVERAGEIFS = createStatisticsFunction('AVERAGEIFS');
