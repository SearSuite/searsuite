import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * STDEVA formula.
 * Evaluates the Excel-compatible STDEVA statistical function.
 * Example: =STDEVA(1,2,3).
 */
export const STDEVA = createStatisticsFunction('STDEVA');
