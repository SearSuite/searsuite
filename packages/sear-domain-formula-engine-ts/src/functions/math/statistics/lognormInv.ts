import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * LOGNORM.INV formula.
 * Evaluates the Excel-compatible LOGNORM.INV statistical function.
 * Example: =LOGNORM.INV(0.5,1,1).
 */
export const LOGNORM_INV = createStatisticsFunction('LOGNORM.INV');
