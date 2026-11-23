/**
 * DVAR: Returns the sample variance of matching records.
 * Example: =DVAR(A1:C5,"Sales",E1:F2)
 */
import { createDatabaseFunction } from './DatabaseRuntime';

export const DVAR = createDatabaseFunction('DVAR');
