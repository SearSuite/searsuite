import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * BETA.INV formula.
 * Evaluates the Excel-compatible BETA.INV statistical function.
 * Example: =BETA.INV(0.5,1,1).
 */
export const BETA_INV = createStatisticsFunction('BETA.INV');
