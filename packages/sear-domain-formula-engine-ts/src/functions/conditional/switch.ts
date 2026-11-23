/**
 * SWITCH: Matches one expression and returns its paired result.
 * Example: =SWITCH(2,1,"one",2,"two","other")
 */
import { createLogicalFunction } from './LogicalRuntime';

export const SWITCH = createLogicalFunction('SWITCH');
