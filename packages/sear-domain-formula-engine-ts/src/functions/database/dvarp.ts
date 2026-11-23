/**
 * DVARP: Returns the population variance of matching records.
 * Example: =DVARP(A1:C5,"Sales",E1:F2)
 */
import { createDatabaseFunction } from './DatabaseRuntime';

export const DVARP = createDatabaseFunction('DVARP');
