import { type OTOperation } from '@searsuite/sear-domain-ot';
import { matrixOperationToStructureChange } from './matrixOperationToStructureChange';
import { type StructureChange } from './StructureChange';

/** Converts Matrix OT operations into formula structure changes. */
export function matrixOperationsToStructureChanges(operations: readonly OTOperation[]): StructureChange[] {
  return operations.flatMap((operation) => {
    const change = matrixOperationToStructureChange(operation);
    return change ? [change] : [];
  });
}
