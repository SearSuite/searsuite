import { MatrixOTActionName } from '@searsuite/sear-domain-ot';

/** Formula-aware insertion or deletion of a coordinate interval. */
export interface StructureInsertDeleteChange {
  type:
    | MatrixOTActionName.RowInsert
    | MatrixOTActionName.RowDelete
    | MatrixOTActionName.ColInsert
    | MatrixOTActionName.ColDelete;
  index: number;
  count: number;
}
