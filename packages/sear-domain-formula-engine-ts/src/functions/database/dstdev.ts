/**
 * DSTDEV: Returns the sample standard deviation of matching records.
 * Example: =DSTDEV(A1:C5,"Sales",E1:F2)
 */
import { createDatabaseFunction } from './DatabaseRuntime';

export const DSTDEV = createDatabaseFunction('DSTDEV');
