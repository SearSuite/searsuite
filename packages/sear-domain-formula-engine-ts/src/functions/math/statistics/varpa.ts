import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * VARPA formula.
 * Evaluates the Excel-compatible VARPA statistical function.
 * Example: =VARPA(1,2,3).
 */
export const VARPA = createStatisticsFunction('VARPA');
