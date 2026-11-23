/**
 * DMAX: Returns the largest matching numeric database value.
 * Example: =DMAX(A1:C5,"Sales",E1:F2)
 */
import { createDatabaseFunction } from './DatabaseRuntime';

export const DMAX = createDatabaseFunction('DMAX');
