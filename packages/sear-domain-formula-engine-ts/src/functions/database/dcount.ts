/**
 * DCOUNT: Counts matching database records containing numbers.
 * Example: =DCOUNT(A1:C5,"Sales",E1:F2)
 */
import { createDatabaseFunction } from './DatabaseRuntime';

export const DCOUNT = createDatabaseFunction('DCOUNT');
