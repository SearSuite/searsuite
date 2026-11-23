/**
 * DGET: Returns the single field value from exactly one matching record.
 * Example: =DGET(A1:C5,"Sales",E1:F2)
 */
import { createDatabaseFunction } from './DatabaseRuntime';

export const DGET = createDatabaseFunction('DGET');
