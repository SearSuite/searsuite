/**
 * DSTDEVP: Returns the population standard deviation of matching records.
 * Example: =DSTDEVP(A1:C5,"Sales",E1:F2)
 */
import { createDatabaseFunction } from './DatabaseRuntime';

export const DSTDEVP = createDatabaseFunction('DSTDEVP');
