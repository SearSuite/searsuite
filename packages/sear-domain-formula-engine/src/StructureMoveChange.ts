import { MatrixOTActionName } from '@searsuite/sear-domain-ot';

/** Formula-aware row or column move. */
export interface StructureMoveChange {
  type: MatrixOTActionName.RowMove | MatrixOTActionName.ColMove;
  fromIndex: number;
  toIndex: number;
}
