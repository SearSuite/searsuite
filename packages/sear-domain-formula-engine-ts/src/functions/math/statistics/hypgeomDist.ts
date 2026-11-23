import { createStatisticsFunction } from './StatisticsRuntime';

/**
 * HYPGEOM.DIST formula.
 * Evaluates the Excel-compatible HYPGEOM.DIST statistical function.
 * Example: =HYPGEOM.DIST(1,1,TRUE).
 */
export const HYPGEOM_DIST = createStatisticsFunction('HYPGEOM.DIST');
