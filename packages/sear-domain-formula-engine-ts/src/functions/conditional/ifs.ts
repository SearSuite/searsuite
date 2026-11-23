/**
 * IFS: Returns the value paired with the first TRUE condition.
 * Example: =IFS(A1>90,"A",A1>80,"B",TRUE,"C")
 */
import { createLogicalFunction } from './LogicalRuntime';

export const IFS = createLogicalFunction('IFS');
