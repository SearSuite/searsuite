/**
 * DAVERAGE: Returns the average of matching numeric database records.
 * Example: =DAVERAGE(A1:C5,"Sales",E1:F2)
 */
import { createDatabaseFunction } from './DatabaseRuntime';

export const DAVERAGE = createDatabaseFunction('DAVERAGE');
