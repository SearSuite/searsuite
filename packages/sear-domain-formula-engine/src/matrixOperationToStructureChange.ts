import { MatrixOTActionName, isMatrixStructureOperation, type OTOperation } from '@searsuite/sear-domain-ot';
import { FormulaStructureChangeActionNames } from './FormulaStructureChangeActionNames';
import { type StructureChange } from './StructureChange';

/** Converts one Matrix OT structure operation into a formula structure change. */
export function matrixOperationToStructureChange(operation: OTOperation): StructureChange | null {
  if (!isMatrixStructureOperation(operation)) return null;
  const index = operation.p[0];
  if (typeof index !== 'number' || !Number.isInteger(index)) return null;
  const type = FormulaStructureChangeActionNames.find(
    (candidate) => candidate in operation && Reflect.get(operation, candidate) !== void 0,
  );
  if (!type) return null;
  if (type === MatrixOTActionName.RowMove || type === MatrixOTActionName.ColMove) {
    const target = Reflect.get(operation, type);
    const toIndex = Array.isArray(target) ? target[0] : void 0;
    return typeof toIndex === 'number' && Number.isInteger(toIndex) ? { type, fromIndex: index, toIndex } : null;
  }
  return { type, index, count: 1 };
}
