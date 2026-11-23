import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * GAMMA formula.
 * Evaluates the Excel-compatible GAMMA statistical function.
 * Example: =GAMMA(1,2,3).
 */
export const GAMMA = createStatisticsFunction('GAMMA');
