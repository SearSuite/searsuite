import { MatrixOTActionName } from '@searsuite/sear-domain-ot';
import { type StructureChangeType } from './StructureChangeType';

/** Matrix OT action names that participate in formula reference rebasing. */
export const FormulaStructureChangeActionNames: readonly StructureChangeType[] = [
  MatrixOTActionName.RowInsert,
  MatrixOTActionName.RowDelete,
  MatrixOTActionName.RowMove,
  MatrixOTActionName.ColInsert,
  MatrixOTActionName.ColDelete,
  MatrixOTActionName.ColMove,
];
