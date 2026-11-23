import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * MINA formula.
 * Evaluates the Excel-compatible MINA statistical function.
 * Example: =MINA(1,2,3).
 */
export const MINA = createStatisticsFunction('MINA');
