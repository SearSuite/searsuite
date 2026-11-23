/**
 * NOT: Returns the inverse of a logical value.
 * Example: =NOT(TRUE)
 */
import { createLogicalFunction } from './LogicalRuntime';

export const NOT = createLogicalFunction('NOT');
