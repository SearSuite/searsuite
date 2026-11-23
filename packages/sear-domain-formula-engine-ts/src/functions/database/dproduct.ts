/**
 * DPRODUCT: Multiplies matching numeric database values.
 * Example: =DPRODUCT(A1:C5,"Sales",E1:F2)
 */
import { createDatabaseFunction } from './DatabaseRuntime';

export const DPRODUCT = createDatabaseFunction('DPRODUCT');
