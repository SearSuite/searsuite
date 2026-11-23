/**
 * DMIN: Returns the smallest matching numeric database value.
 * Example: =DMIN(A1:C5,"Sales",E1:F2)
 */
import { createDatabaseFunction } from './DatabaseRuntime';

export const DMIN = createDatabaseFunction('DMIN');
