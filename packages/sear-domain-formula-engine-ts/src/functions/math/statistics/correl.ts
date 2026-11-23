import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * CORREL formula.
 * Evaluates the Excel-compatible CORREL statistical function.
 * Example: =CORREL(1,2,3).
 */
export const CORREL = createStatisticsFunction('CORREL');
