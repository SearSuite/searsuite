import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * BINOM.INV formula.
 * Evaluates the Excel-compatible BINOM.INV statistical function.
 * Example: =BINOM.INV(0.5,1,1).
 */
export const BINOM_INV = createStatisticsFunction('BINOM.INV');
