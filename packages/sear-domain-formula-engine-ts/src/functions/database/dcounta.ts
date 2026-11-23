/**
 * DCOUNTA: Counts matching nonblank database records.
 * Example: =DCOUNTA(A1:C5,"Name",E1:F2)
 */
import { createDatabaseFunction } from './DatabaseRuntime';

export const DCOUNTA = createDatabaseFunction('DCOUNTA');
