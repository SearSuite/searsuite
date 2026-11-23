/**
 * IFNA: Returns a fallback only when the input is #N/A.
 * Example: =IFNA(NA(),0)
 */
import { createLogicalFunction } from './LogicalRuntime';

export const IFNA = createLogicalFunction('IFNA');
