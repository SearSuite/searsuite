import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * MODE.SNGL formula.
 * Evaluates the Excel-compatible MODE.SNGL statistical function.
 * Example: =MODE.SNGL(1,2,3).
 */
export const MODE_SNGL = createStatisticsFunction('MODE.SNGL');
