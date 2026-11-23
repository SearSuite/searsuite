import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * MODE.MULT formula.
 * Evaluates the Excel-compatible MODE.MULT statistical function.
 * Example: =MODE.MULT(1,2,3).
 */
export const MODE_MULT = createStatisticsFunction('MODE.MULT');
