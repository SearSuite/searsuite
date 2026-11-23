/**
 * DSUM: Sums matching numeric database values.
 * Example: =DSUM(A1:C5,"Sales",E1:F2)
 */
import { createDatabaseFunction } from './DatabaseRuntime';

export const DSUM = createDatabaseFunction('DSUM');
