import { MatrixOTActionName } from '@searsuite/sear-domain-ot';

/** Matrix structure action understood by formula reference transforms. */
export type StructureChangeType =
  | MatrixOTActionName.RowInsert
  | MatrixOTActionName.RowDelete
  | MatrixOTActionName.RowMove
  | MatrixOTActionName.ColInsert
  | MatrixOTActionName.ColDelete
  | MatrixOTActionName.ColMove;
