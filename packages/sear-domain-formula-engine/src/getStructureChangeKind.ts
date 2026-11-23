import { MatrixOTActionName } from '@searsuite/sear-domain-ot';
import { type StructureChange } from './StructureChange';
import { StructureChangeKind } from './StructureChangeKind';

/** Returns whether one structure change inserts, deletes, or moves coordinates. */
export function getStructureChangeKind(change: StructureChange): StructureChangeKind | undefined {
  switch (change.type) {
    case MatrixOTActionName.RowInsert:
    case MatrixOTActionName.ColInsert:
      return StructureChangeKind.Insert;
    case MatrixOTActionName.RowDelete:
    case MatrixOTActionName.ColDelete:
      return StructureChangeKind.Delete;
    case MatrixOTActionName.RowMove:
    case MatrixOTActionName.ColMove:
      return StructureChangeKind.Move;
  }
}
